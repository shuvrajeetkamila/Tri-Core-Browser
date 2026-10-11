// TRI-CORE BROWSER native FSR 1.0.2 proof-of-concept.
// The EASU/RCAS algorithms and AMD sample shader wrapper are retained from the
// official AMD FidelityFX-FSR repository; see third_party/amd/UPSTREAM.md.
// This stand-alone D3D12 harness does not access browser or other-process memory.

#include <windows.h>
#include <d3d12.h>
#include <dxgi1_6.h>
#include <d3dcompiler.h>
#include <wincodec.h>
#include <wrl/client.h>

#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <limits>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

#define A_CPU 1
#include "third_party/amd/ffx_a.h"
#include "third_party/amd/ffx_fsr1.h"

#pragma comment(lib, "d3d12.lib")
#pragma comment(lib, "dxgi.lib")
#pragma comment(lib, "d3dcompiler.lib")
#pragma comment(lib, "windowscodecs.lib")
#pragma comment(lib, "ole32.lib")

using Microsoft::WRL::ComPtr;
namespace fs = std::filesystem;

namespace {
constexpr UINT kSyntheticInputWidth = 320;
constexpr UINT kSyntheticInputHeight = 192;
constexpr UINT kScaleFactor = 2;
constexpr UINT kMaximumInputDimension = 4096;
constexpr uint64_t kMaximumInputPixels = 2ull * 1024ull * 1024ull;
constexpr UINT kWorkRegion = 16;
constexpr UINT kConstantCount = 20;
constexpr UINT kDescriptorCount = 4;
constexpr DXGI_FORMAT kImageFormat = DXGI_FORMAT_R8G8B8A8_UNORM;

struct Options {
    bool useWarp = false;
    bool hardwareRequested = false;
    bool listAdapters = false;
    int adapterIndex = -1;
    fs::path outputDirectory = "fsr1-poc-results";
    fs::path inputPng;
    fs::path outputPng;
    fs::path reportJson;
};

struct DeviceSupport {
    std::string featureLevel = "11_0";
    std::string shaderModel = "unavailable";
    bool texture2d = false;
    bool shaderSample = false;
    bool shaderLoad = false;
    bool unorderedAccess = false;
    bool typedUavStore = false;
    bool supportsFsr = false;
};

struct Adapter {
    ComPtr<IDXGIAdapter1> dxgi;
    ComPtr<ID3D12Device> device;
    DXGI_ADAPTER_DESC1 description{};
    DeviceSupport support{};
    UINT selectionIndex = 0;
    bool software = false;
};

struct FrameInput {
    UINT width = 0;
    UINT height = 0;
    std::vector<uint8_t> rgba;
};

struct alignas(16) FsrConstants {
    uint32_t values[kConstantCount]{};
};

struct ImageMetrics {
    uint64_t checksum = 0;
    uint64_t absoluteDifferenceFromBilinear = 0;
    double meanAbsoluteDifferenceFromBilinear = 0;
    uint8_t minimum = 255;
    uint8_t maximum = 0;
    size_t distinctSampledColors = 0;
};

std::string HrString(HRESULT hr) {
    std::ostringstream out;
    out << "0x" << std::hex << std::uppercase << static_cast<uint32_t>(hr);
    return out.str();
}

void Check(HRESULT hr, const char* operation) {
    if (FAILED(hr)) throw std::runtime_error(std::string(operation) + " failed (HRESULT " + HrString(hr) + ")");
}

std::string Utf8(const wchar_t* value) {
    if (!value || !*value) return {};
    const int length = WideCharToMultiByte(CP_UTF8, 0, value, -1, nullptr, 0, nullptr, nullptr);
    if (length <= 1) return {};
    std::string output(static_cast<size_t>(length), '\0');
    WideCharToMultiByte(CP_UTF8, 0, value, -1, output.data(), length, nullptr, nullptr);
    output.resize(static_cast<size_t>(length - 1));
    return output;
}

std::string JsonEscape(const std::string& value) {
    std::ostringstream out;
    for (unsigned char ch : value) {
        switch (ch) {
        case '"': out << "\\\""; break;
        case '\\': out << "\\\\"; break;
        case '\b': out << "\\b"; break;
        case '\f': out << "\\f"; break;
        case '\n': out << "\\n"; break;
        case '\r': out << "\\r"; break;
        case '\t': out << "\\t"; break;
        default:
            if (ch < 0x20) out << "\\u" << std::hex << std::setw(4) << std::setfill('0') << static_cast<int>(ch) << std::dec;
            else out << static_cast<char>(ch);
        }
    }
    return out.str();
}

fs::path ExecutableDirectory() {
    std::array<wchar_t, 32768> buffer{};
    const DWORD size = GetModuleFileNameW(nullptr, buffer.data(), static_cast<DWORD>(buffer.size()));
    if (!size || size >= buffer.size()) throw std::runtime_error("Could not resolve the proof-of-concept executable directory.");
    return fs::path(std::wstring(buffer.data(), size)).parent_path();
}

Options ParseOptions(int argc, wchar_t** argv) {
    Options options;
    for (int index = 1; index < argc; ++index) {
        const std::wstring argument(argv[index]);
        if (argument == L"--warp") options.useWarp = true;
        else if (argument == L"--hardware") options.hardwareRequested = true;
        else if (argument == L"--list-adapters") options.listAdapters = true;
        else if (argument == L"--adapter-index" && index + 1 < argc) {
            try {
                const unsigned long parsed = std::stoul(argv[++index]);
                if (parsed > 1024) throw std::out_of_range("adapter index");
                options.adapterIndex = static_cast<int>(parsed);
            } catch (...) {
                throw std::runtime_error("--adapter-index must be a non-negative integer.");
            }
        } else if (argument == L"--out-dir" && index + 1 < argc) options.outputDirectory = argv[++index];
        else if (argument == L"--input-png" && index + 1 < argc) options.inputPng = argv[++index];
        else if (argument == L"--output-png" && index + 1 < argc) options.outputPng = argv[++index];
        else if (argument == L"--report-json" && index + 1 < argc) options.reportJson = argv[++index];
        else if (argument == L"--help" || argument == L"-h") {
            std::wcout << L"Usage: TriCoreFsr1Poc.exe --list-adapters\n"
                       << L"       TriCoreFsr1Poc.exe (--hardware [--adapter-index N] | --warp) [--out-dir PATH]\n"
                       << L"       TriCoreFsr1Poc.exe (--hardware [--adapter-index N] | --warp) --input-png PATH --output-png PATH --report-json PATH\n"
                       << L"  --list-adapters  Enumerate D3D12 adapters and report FSR1 format/shader support as JSON.\n"
                       << L"  --hardware       Require an FSR-capable non-software D3D12 adapter; never falls back to WARP.\n"
                       << L"  --adapter-index  Select the zero-based D3D12 hardware adapter from --list-adapters.\n"
                       << L"  --warp            Explicitly run the WARP software adapter (never physical-GPU evidence).\n"
                       << L"  --input-png       Process a PNG screenshot; output resolution is exactly 2x each input dimension.\n"
                       << L"  --output-png      Write the processed image as PNG.\n"
                       << L"  --report-json     Write machine-readable adapter, timing, dimensions, and validation details.\n"
                       << L"This app-owned D3D12 pipeline does not access Chromium textures or other-process memory.\n";
            std::exit(0);
        } else {
            throw std::runtime_error("Unknown or incomplete command-line argument.");
        }
    }
    if (options.listAdapters) {
        if (options.useWarp || options.hardwareRequested || options.adapterIndex >= 0 || !options.inputPng.empty() || !options.outputPng.empty() || !options.reportJson.empty()) {
            throw std::runtime_error("--list-adapters cannot be combined with processing or adapter-selection arguments.");
        }
        return options;
    }
    if (options.useWarp == options.hardwareRequested) {
        throw std::runtime_error("Specify exactly one of --hardware or --warp.");
    }
    if (options.useWarp && options.adapterIndex >= 0) throw std::runtime_error("--adapter-index cannot be combined with --warp.");
    const bool anyPngPath = !options.inputPng.empty() || !options.outputPng.empty() || !options.reportJson.empty();
    const bool allPngPaths = !options.inputPng.empty() && !options.outputPng.empty() && !options.reportJson.empty();
    if (anyPngPath && !allPngPaths) throw std::runtime_error("PNG processing requires --input-png, --output-png, and --report-json together.");
    if (options.inputPng.empty() && (options.adapterIndex >= 0)) {
        // Adapter selection is also valid for the synthetic native regression harness.
    }
    if (options.inputPng.empty() && options.outputDirectory.is_relative()) options.outputDirectory = fs::absolute(options.outputDirectory);
    if (!options.inputPng.empty()) {
        if (options.inputPng.is_relative()) options.inputPng = fs::absolute(options.inputPng);
        if (options.outputPng.is_relative()) options.outputPng = fs::absolute(options.outputPng);
        if (options.reportJson.is_relative()) options.reportJson = fs::absolute(options.reportJson);
    }
    return options;
}

DeviceSupport QueryDeviceSupport(ID3D12Device* device) {
    DeviceSupport support;
    D3D12_FEATURE_DATA_FORMAT_SUPPORT format{};
    format.Format = kImageFormat;
    const HRESULT formatResult = device->CheckFeatureSupport(D3D12_FEATURE_FORMAT_SUPPORT, &format, sizeof(format));
    if (SUCCEEDED(formatResult)) {
        support.texture2d = (format.Support1 & D3D12_FORMAT_SUPPORT1_TEXTURE2D) != 0;
        support.shaderSample = (format.Support1 & D3D12_FORMAT_SUPPORT1_SHADER_SAMPLE) != 0;
        support.shaderLoad = (format.Support1 & D3D12_FORMAT_SUPPORT1_SHADER_LOAD) != 0;
    }
    support.unorderedAccess = (format.Support1 & D3D12_FORMAT_SUPPORT1_TYPED_UNORDERED_ACCESS_VIEW) != 0;
    support.typedUavStore = (format.Support2 & D3D12_FORMAT_SUPPORT2_UAV_TYPED_STORE) != 0;

    D3D12_FEATURE_DATA_SHADER_MODEL shaderModel{};
    shaderModel.HighestShaderModel = D3D_SHADER_MODEL_6_0;
    const HRESULT shaderResult = device->CheckFeatureSupport(D3D12_FEATURE_SHADER_MODEL, &shaderModel, sizeof(shaderModel));
    if (SUCCEEDED(shaderResult)) {
        if (shaderModel.HighestShaderModel >= D3D_SHADER_MODEL_6_0) support.shaderModel = "6_0+";
        else if (shaderModel.HighestShaderModel >= D3D_SHADER_MODEL_5_1) support.shaderModel = "5_1";
        else support.shaderModel = "below_5_1";
    } else {
        // D3D12 feature-level 11_0 guarantees the SM5.1 compute language used by the pinned AMD shaders.
        support.shaderModel = "5_1 (D3D12 feature-level 11_0 baseline; query unavailable)";
    }
    support.supportsFsr = support.texture2d && support.shaderSample && support.shaderLoad &&
        support.unorderedAccess && support.typedUavStore && support.shaderModel.find("below") != 0;
    return support;
}

std::vector<Adapter> EnumerateHardwareAdapters() {
    ComPtr<IDXGIFactory6> factory;
    Check(CreateDXGIFactory2(0, IID_PPV_ARGS(&factory)), "CreateDXGIFactory2");
    std::vector<Adapter> adapters;
    UINT selectionIndex = 0;
    for (UINT index = 0;; ++index) {
        ComPtr<IDXGIAdapter1> candidate;
        const HRESULT enumResult = factory->EnumAdapters1(index, &candidate);
        if (enumResult == DXGI_ERROR_NOT_FOUND) break;
        Check(enumResult, "EnumAdapters1");
        DXGI_ADAPTER_DESC1 description{};
        Check(candidate->GetDesc1(&description), "GetDesc1");
        if (description.Flags & DXGI_ADAPTER_FLAG_SOFTWARE) continue;
        ComPtr<ID3D12Device> device;
        if (FAILED(D3D12CreateDevice(candidate.Get(), D3D_FEATURE_LEVEL_11_0, IID_PPV_ARGS(&device)))) continue;
        Adapter adapter;
        adapter.dxgi = std::move(candidate);
        adapter.device = std::move(device);
        adapter.description = description;
        adapter.support = QueryDeviceSupport(adapter.device.Get());
        adapter.selectionIndex = selectionIndex++;
        adapter.software = false;
        adapters.push_back(std::move(adapter));
    }
    return adapters;
}

void PrintAdapters() {
    const auto adapters = EnumerateHardwareAdapters();
    ComPtr<IDXGIFactory6> factory;
    Check(CreateDXGIFactory2(0, IID_PPV_ARGS(&factory)), "CreateDXGIFactory2");
    ComPtr<IDXGIAdapter> warp;
    const bool warpAvailable = SUCCEEDED(factory->EnumWarpAdapter(IID_PPV_ARGS(&warp)));
    std::cout << "{\"status\":\"PASS\",\"api\":\"Direct3D 12\",\"warpAvailable\":"
              << (warpAvailable ? "true" : "false") << ",\"adapters\":[";
    for (size_t index = 0; index < adapters.size(); ++index) {
        const Adapter& adapter = adapters[index];
        if (index) std::cout << ',';
        std::cout << "{\"index\":" << adapter.selectionIndex
                  << ",\"name\":\"" << JsonEscape(Utf8(adapter.description.Description)) << '"'
                  << ",\"vendorId\":\"0x" << std::hex << std::setw(4) << std::setfill('0') << adapter.description.VendorId << std::dec << '"'
                  << ",\"deviceId\":\"0x" << std::hex << std::setw(4) << std::setfill('0') << adapter.description.DeviceId << std::dec << '"'
                  << ",\"dedicatedVideoMemoryBytes\":" << adapter.description.DedicatedVideoMemory
                  << ",\"softwareAdapter\":false"
                  << ",\"featureLevel\":\"" << adapter.support.featureLevel << '"'
                  << ",\"shaderModel\":\"" << JsonEscape(adapter.support.shaderModel) << '"'
                  << ",\"supports\":{\"r8g8b8a8Texture2D\":" << (adapter.support.texture2d ? "true" : "false")
                  << ",\"shaderSample\":" << (adapter.support.shaderSample ? "true" : "false")
                  << ",\"shaderLoad\":" << (adapter.support.shaderLoad ? "true" : "false")
                  << ",\"unorderedAccess\":" << (adapter.support.unorderedAccess ? "true" : "false")
                  << ",\"typedUavStore\":" << (adapter.support.typedUavStore ? "true" : "false")
                  << "},\"fsr1Compatible\":" << (adapter.support.supportsFsr ? "true" : "false") << '}';
    }
    std::cout << "]}\n";
}

Adapter CreateAdapter(bool useWarp, int requestedIndex) {
    if (useWarp) {
        ComPtr<IDXGIFactory6> factory;
        Check(CreateDXGIFactory2(0, IID_PPV_ARGS(&factory)), "CreateDXGIFactory2");
        Adapter selected;
        Check(factory->EnumWarpAdapter(IID_PPV_ARGS(&selected.dxgi)), "EnumWarpAdapter");
        selected.software = true;
        Check(selected.dxgi->GetDesc1(&selected.description), "GetDesc1(WARP)");
        Check(D3D12CreateDevice(selected.dxgi.Get(), D3D_FEATURE_LEVEL_11_0, IID_PPV_ARGS(&selected.device)), "D3D12CreateDevice(WARP)");
        selected.support = QueryDeviceSupport(selected.device.Get());
        if (!selected.support.supportsFsr) throw std::runtime_error("NOT RUN: the WARP adapter does not expose the format/shader features required by FSR1.");
        return selected;
    }

    const auto adapters = EnumerateHardwareAdapters();
    if (requestedIndex >= 0) {
        const auto selected = std::find_if(adapters.begin(), adapters.end(), [requestedIndex](const Adapter& adapter) {
            return adapter.selectionIndex == static_cast<UINT>(requestedIndex);
        });
        if (selected == adapters.end()) throw std::runtime_error("NOT RUN: the requested D3D12 adapter index was not enumerated.");
        if (!selected->support.supportsFsr) throw std::runtime_error("NOT RUN: the selected adapter lacks one or more required FSR1 D3D12 format/shader features.");
        return *selected;
    }
    const auto selected = std::find_if(adapters.begin(), adapters.end(), [](const Adapter& adapter) { return adapter.support.supportsFsr; });
    if (selected != adapters.end()) return *selected;
    throw std::runtime_error("NOT RUN: no FSR-capable non-software D3D12 hardware adapter is available. Use --warp only for a software pipeline smoke test.");
}

std::string DriverInterfaceVersion(const Adapter& adapter) {
    LARGE_INTEGER version{};
    if (FAILED(adapter.dxgi->CheckInterfaceSupport(__uuidof(IDXGIDevice), &version))) return {};
    std::ostringstream output;
    output << "0x" << std::hex << std::uppercase << static_cast<uint64_t>(version.QuadPart);
    return output.str();
}

D3D12_HEAP_PROPERTIES HeapProperties(D3D12_HEAP_TYPE type) {
    D3D12_HEAP_PROPERTIES props{};
    props.Type = type;
    props.CPUPageProperty = D3D12_CPU_PAGE_PROPERTY_UNKNOWN;
    props.MemoryPoolPreference = D3D12_MEMORY_POOL_UNKNOWN;
    props.CreationNodeMask = 1;
    props.VisibleNodeMask = 1;
    return props;
}

D3D12_RESOURCE_DESC TextureDescription(UINT width, UINT height, D3D12_RESOURCE_FLAGS flags) {
    D3D12_RESOURCE_DESC desc{};
    desc.Dimension = D3D12_RESOURCE_DIMENSION_TEXTURE2D;
    desc.Width = width;
    desc.Height = height;
    desc.DepthOrArraySize = 1;
    desc.MipLevels = 1;
    desc.Format = kImageFormat;
    desc.SampleDesc.Count = 1;
    desc.Layout = D3D12_TEXTURE_LAYOUT_UNKNOWN;
    desc.Flags = flags;
    return desc;
}

ComPtr<ID3D12Resource> CreateTexture(ID3D12Device* device, UINT width, UINT height, D3D12_RESOURCE_FLAGS flags, D3D12_RESOURCE_STATES state) {
    const D3D12_RESOURCE_DESC desc = TextureDescription(width, height, flags);
    const D3D12_HEAP_PROPERTIES heap = HeapProperties(D3D12_HEAP_TYPE_DEFAULT);
    ComPtr<ID3D12Resource> resource;
    Check(device->CreateCommittedResource(&heap, D3D12_HEAP_FLAG_NONE, &desc, state, nullptr, IID_PPV_ARGS(&resource)), "CreateCommittedResource(texture)");
    return resource;
}

ComPtr<ID3D12Resource> CreateBuffer(ID3D12Device* device, UINT64 size, D3D12_HEAP_TYPE heapType, D3D12_RESOURCE_STATES state) {
    D3D12_RESOURCE_DESC desc{};
    desc.Dimension = D3D12_RESOURCE_DIMENSION_BUFFER;
    desc.Width = size;
    desc.Height = 1;
    desc.DepthOrArraySize = 1;
    desc.MipLevels = 1;
    desc.SampleDesc.Count = 1;
    desc.Layout = D3D12_TEXTURE_LAYOUT_ROW_MAJOR;
    const D3D12_HEAP_PROPERTIES heap = HeapProperties(heapType);
    ComPtr<ID3D12Resource> resource;
    Check(device->CreateCommittedResource(&heap, D3D12_HEAP_FLAG_NONE, &desc, state, nullptr, IID_PPV_ARGS(&resource)), "CreateCommittedResource(buffer)");
    return resource;
}

void Transition(ID3D12GraphicsCommandList* commandList, ID3D12Resource* resource, D3D12_RESOURCE_STATES before, D3D12_RESOURCE_STATES after) {
    D3D12_RESOURCE_BARRIER barrier{};
    barrier.Type = D3D12_RESOURCE_BARRIER_TYPE_TRANSITION;
    barrier.Transition.pResource = resource;
    barrier.Transition.Subresource = D3D12_RESOURCE_BARRIER_ALL_SUBRESOURCES;
    barrier.Transition.StateBefore = before;
    barrier.Transition.StateAfter = after;
    commandList->ResourceBarrier(1, &barrier);
}

std::vector<uint8_t> MakeInputScene(UINT width, UINT height) {
    std::vector<uint8_t> pixels(static_cast<size_t>(width) * height * 4);
    for (UINT y = 0; y < height; ++y) {
        for (UINT x = 0; x < width; ++x) {
            const bool left = x < width / 2;
            const bool upper = y < height / 2;
            const bool checker = ((x / 8) + (y / 8)) % 2 == 0;
            uint8_t red = static_cast<uint8_t>(left ? 38 : 222);
            uint8_t green = static_cast<uint8_t>(upper ? 45 : 210);
            uint8_t blue = static_cast<uint8_t>(checker ? 216 : 46);
            const int diagonalDistance = std::abs(static_cast<int>(y) - static_cast<int>(x * 3 / 5));
            if (diagonalDistance <= 1) { red = 250; green = 245; blue = 40; }
            if ((x % 32) == 0 || (y % 32) == 0) { red = 235; green = 50; blue = 60; }
            const size_t offset = (static_cast<size_t>(y) * width + x) * 4;
            pixels[offset + 0] = red;
            pixels[offset + 1] = green;
            pixels[offset + 2] = blue;
            pixels[offset + 3] = 255;
        }
    }
    return pixels;
}

std::vector<uint8_t> MakeBilinearReference(const std::vector<uint8_t>& input, UINT inputWidth, UINT inputHeight,
                                           UINT outputWidth, UINT outputHeight) {
    std::vector<uint8_t> output(static_cast<size_t>(outputWidth) * outputHeight * 4);
    for (UINT y = 0; y < outputHeight; ++y) {
        const double sourceY = std::clamp((static_cast<double>(y) + 0.5) * inputHeight / outputHeight - 0.5, 0.0, static_cast<double>(inputHeight - 1));
        const UINT y0 = static_cast<UINT>(std::floor(sourceY));
        const UINT y1 = std::min(y0 + 1, inputHeight - 1);
        const double fy = sourceY - y0;
        for (UINT x = 0; x < outputWidth; ++x) {
            const double sourceX = std::clamp((static_cast<double>(x) + 0.5) * inputWidth / outputWidth - 0.5, 0.0, static_cast<double>(inputWidth - 1));
            const UINT x0 = static_cast<UINT>(std::floor(sourceX));
            const UINT x1 = std::min(x0 + 1, inputWidth - 1);
            const double fx = sourceX - x0;
            const size_t outOffset = (static_cast<size_t>(y) * outputWidth + x) * 4;
            const size_t p00 = (static_cast<size_t>(y0) * inputWidth + x0) * 4;
            const size_t p10 = (static_cast<size_t>(y0) * inputWidth + x1) * 4;
            const size_t p01 = (static_cast<size_t>(y1) * inputWidth + x0) * 4;
            const size_t p11 = (static_cast<size_t>(y1) * inputWidth + x1) * 4;
            for (size_t channel = 0; channel < 3; ++channel) {
                const double top = input[p00 + channel] * (1.0 - fx) + input[p10 + channel] * fx;
                const double bottom = input[p01 + channel] * (1.0 - fx) + input[p11 + channel] * fx;
                output[outOffset + channel] = static_cast<uint8_t>(std::clamp(std::lround(top * (1.0 - fy) + bottom * fy), 0L, 255L));
            }
            output[outOffset + 3] = 255;
        }
    }
    return output;
}

#pragma pack(push, 1)
struct BitmapFileHeader {
    uint16_t type = 0x4d42;
    uint32_t size = 0;
    uint16_t reserved1 = 0;
    uint16_t reserved2 = 0;
    uint32_t pixelOffset = 54;
};
struct BitmapInfoHeader {
    uint32_t size = 40;
    int32_t width = 0;
    int32_t height = 0;
    uint16_t planes = 1;
    uint16_t bitCount = 32;
    uint32_t compression = 0;
    uint32_t imageSize = 0;
    int32_t xPixelsPerMeter = 2835;
    int32_t yPixelsPerMeter = 2835;
    uint32_t colorsUsed = 0;
    uint32_t colorsImportant = 0;
};
#pragma pack(pop)

void WriteBmp(const fs::path& path, UINT width, UINT height, const std::vector<uint8_t>& rgba) {
    if (rgba.size() != static_cast<size_t>(width) * height * 4) throw std::runtime_error("Image byte count does not match BMP dimensions.");
    BitmapFileHeader fileHeader{};
    BitmapInfoHeader infoHeader{};
    fileHeader.size = static_cast<uint32_t>(sizeof(fileHeader) + sizeof(infoHeader) + rgba.size());
    infoHeader.width = static_cast<int32_t>(width);
    infoHeader.height = -static_cast<int32_t>(height); // top-down rows
    infoHeader.imageSize = static_cast<uint32_t>(rgba.size());
    std::ofstream file(path, std::ios::binary);
    if (!file) throw std::runtime_error("Could not write image capture: " + path.string());
    file.write(reinterpret_cast<const char*>(&fileHeader), sizeof(fileHeader));
    file.write(reinterpret_cast<const char*>(&infoHeader), sizeof(infoHeader));
    for (size_t index = 0; index < rgba.size(); index += 4) {
        const char bgra[4] = {
            static_cast<char>(rgba[index + 2]),
            static_cast<char>(rgba[index + 1]),
            static_cast<char>(rgba[index + 0]),
            static_cast<char>(rgba[index + 3]),
        };
        file.write(bgra, sizeof(bgra));
    }
    if (!file) throw std::runtime_error("Failed while writing image capture: " + path.string());
}

FrameInput ReadPng(const fs::path& path) {
    if (!fs::is_regular_file(path)) throw std::runtime_error("The browser-captured PNG does not exist or is not a regular file.");
    ComPtr<IWICImagingFactory> factory;
    Check(CoCreateInstance(CLSID_WICImagingFactory, nullptr, CLSCTX_INPROC_SERVER, IID_PPV_ARGS(&factory)), "CoCreateInstance(WIC imaging factory)");
    ComPtr<IWICBitmapDecoder> decoder;
    Check(factory->CreateDecoderFromFilename(path.c_str(), nullptr, GENERIC_READ, WICDecodeMetadataCacheOnLoad, &decoder), "CreateDecoderFromFilename(PNG)");
    ComPtr<IWICBitmapFrameDecode> frame;
    Check(decoder->GetFrame(0, &frame), "GetFrame(PNG)");

    FrameInput input;
    Check(frame->GetSize(&input.width, &input.height), "GetSize(PNG)");
    const uint64_t pixels = static_cast<uint64_t>(input.width) * input.height;
    if (input.width == 0 || input.height == 0 || input.width > kMaximumInputDimension || input.height > kMaximumInputDimension || pixels > kMaximumInputPixels) {
        throw std::runtime_error("NOT RUN: the captured PNG dimensions exceed the safe FSR1 input limit (maximum 4096 per side and 2,097,152 pixels).");
    }

    ComPtr<IWICFormatConverter> converter;
    Check(factory->CreateFormatConverter(&converter), "CreateFormatConverter(PNG input)");
    Check(converter->Initialize(frame.Get(), GUID_WICPixelFormat32bppRGBA, WICBitmapDitherTypeNone, nullptr, 0.0, WICBitmapPaletteTypeCustom), "Initialize(PNG RGBA converter)");
    const UINT stride = input.width * 4;
    const UINT byteCount = static_cast<UINT>(pixels * 4);
    input.rgba.resize(byteCount);
    Check(converter->CopyPixels(nullptr, stride, byteCount, input.rgba.data()), "CopyPixels(PNG input)");
    return input;
}

void WritePng(const fs::path& path, UINT width, UINT height, const std::vector<uint8_t>& rgba) {
    if (rgba.size() != static_cast<size_t>(width) * height * 4) throw std::runtime_error("Image byte count does not match PNG dimensions.");
    if (!path.parent_path().empty()) fs::create_directories(path.parent_path());
    ComPtr<IWICImagingFactory> factory;
    Check(CoCreateInstance(CLSID_WICImagingFactory, nullptr, CLSCTX_INPROC_SERVER, IID_PPV_ARGS(&factory)), "CoCreateInstance(WIC imaging factory)");
    ComPtr<IWICStream> stream;
    Check(factory->CreateStream(&stream), "CreateStream(PNG output)");
    Check(stream->InitializeFromFilename(path.c_str(), GENERIC_WRITE), "InitializeFromFilename(PNG output)");
    ComPtr<IWICBitmapEncoder> encoder;
    Check(factory->CreateEncoder(GUID_ContainerFormatPng, nullptr, &encoder), "CreateEncoder(PNG)");
    Check(encoder->Initialize(stream.Get(), WICBitmapEncoderNoCache), "Initialize(PNG encoder)");
    ComPtr<IWICBitmapFrameEncode> frame;
    ComPtr<IPropertyBag2> properties;
    Check(encoder->CreateNewFrame(&frame, &properties), "CreateNewFrame(PNG)");
    Check(frame->Initialize(properties.Get()), "Initialize(PNG frame)");
    Check(frame->SetSize(width, height), "SetSize(PNG frame)");

    WICPixelFormatGUID pixelFormat = GUID_WICPixelFormat32bppBGRA;
    Check(frame->SetPixelFormat(&pixelFormat), "SetPixelFormat(PNG frame)");
    ComPtr<IWICBitmap> sourceBitmap;
    Check(factory->CreateBitmapFromMemory(width, height, GUID_WICPixelFormat32bppRGBA, width * 4,
        static_cast<UINT>(rgba.size()), const_cast<BYTE*>(rgba.data()), &sourceBitmap), "CreateBitmapFromMemory(PNG source)");
    ComPtr<IWICFormatConverter> converter;
    Check(factory->CreateFormatConverter(&converter), "CreateFormatConverter(PNG output)");
    Check(converter->Initialize(sourceBitmap.Get(), pixelFormat, WICBitmapDitherTypeNone, nullptr, 0.0, WICBitmapPaletteTypeCustom), "Initialize(PNG output converter)");
    Check(frame->WriteSource(converter.Get(), nullptr), "WriteSource(PNG frame)");
    Check(frame->Commit(), "Commit(PNG frame)");
    Check(encoder->Commit(), "Commit(PNG encoder)");
}

std::string PathUtf8(const fs::path& path) {
    const auto value = path.generic_u8string();
    return std::string(value.begin(), value.end());
}

ImageMetrics MeasureImage(const std::vector<uint8_t>& output, const std::vector<uint8_t>& baseline) {
    ImageMetrics metrics;
    uint64_t comparedChannels = 0;
    std::array<bool, 256> seenRed{};
    for (size_t index = 0; index < output.size(); ++index) {
        const uint8_t value = output[index];
        metrics.minimum = std::min(metrics.minimum, value);
        metrics.maximum = std::max(metrics.maximum, value);
        metrics.checksum += static_cast<uint64_t>(value) * (index + 1);
        if (index % 4 == 0) seenRed[value] = true;
        if (index % 4 != 3) {
            metrics.absoluteDifferenceFromBilinear += static_cast<uint64_t>(std::abs(static_cast<int>(value) - static_cast<int>(baseline[index])));
            ++comparedChannels;
        }
    }
    metrics.distinctSampledColors = static_cast<size_t>(std::count(seenRed.begin(), seenRed.end(), true));
    metrics.meanAbsoluteDifferenceFromBilinear = comparedChannels
        ? static_cast<double>(metrics.absoluteDifferenceFromBilinear) / comparedChannels
        : 0.0;
    return metrics;
}

ComPtr<ID3DBlob> CompilePass(const fs::path& shaderPath, bool easu) {
    const D3D_SHADER_MACRO easuMacros[] = {
        {"SAMPLE_SLOW_FALLBACK", "1"}, {"SAMPLE_BILINEAR", "0"}, {"SAMPLE_RCAS", "0"}, {"SAMPLE_EASU", "1"},
        {"WIDTH", "64"}, {"HEIGHT", "1"}, {"DEPTH", "1"}, {nullptr, nullptr},
    };
    const D3D_SHADER_MACRO rcasMacros[] = {
        {"SAMPLE_SLOW_FALLBACK", "1"}, {"SAMPLE_BILINEAR", "0"}, {"SAMPLE_RCAS", "1"}, {"SAMPLE_EASU", "0"},
        {"WIDTH", "64"}, {"HEIGHT", "1"}, {"DEPTH", "1"}, {nullptr, nullptr},
    };
    ComPtr<ID3DBlob> bytecode;
    ComPtr<ID3DBlob> errors;
    const HRESULT result = D3DCompileFromFile(
        shaderPath.c_str(),
        easu ? easuMacros : rcasMacros,
        D3D_COMPILE_STANDARD_FILE_INCLUDE,
        "mainCS",
        "cs_5_0",
        D3DCOMPILE_ENABLE_STRICTNESS | D3DCOMPILE_OPTIMIZATION_LEVEL3,
        0,
        &bytecode,
        &errors);
    if (FAILED(result)) {
        const std::string diagnostic = errors ? std::string(static_cast<const char*>(errors->GetBufferPointer()), errors->GetBufferSize()) : "no compiler diagnostics";
        throw std::runtime_error(std::string(easu ? "EASU" : "RCAS") + " HLSL compilation failed (" + HrString(result) + "): " + diagnostic);
    }
    return bytecode;
}

ComPtr<ID3D12RootSignature> CreateRootSignature(ID3D12Device* device) {
    D3D12_DESCRIPTOR_RANGE ranges[2]{};
    ranges[0].RangeType = D3D12_DESCRIPTOR_RANGE_TYPE_SRV;
    ranges[0].NumDescriptors = 1;
    ranges[0].BaseShaderRegister = 0;
    ranges[0].RegisterSpace = 0;
    ranges[0].OffsetInDescriptorsFromTableStart = D3D12_DESCRIPTOR_RANGE_OFFSET_APPEND;
    ranges[1].RangeType = D3D12_DESCRIPTOR_RANGE_TYPE_UAV;
    ranges[1].NumDescriptors = 1;
    ranges[1].BaseShaderRegister = 0;
    ranges[1].RegisterSpace = 0;
    ranges[1].OffsetInDescriptorsFromTableStart = D3D12_DESCRIPTOR_RANGE_OFFSET_APPEND;

    D3D12_ROOT_PARAMETER parameters[3]{};
    parameters[0].ParameterType = D3D12_ROOT_PARAMETER_TYPE_32BIT_CONSTANTS;
    parameters[0].Constants.ShaderRegister = 0;
    parameters[0].Constants.RegisterSpace = 0;
    parameters[0].Constants.Num32BitValues = kConstantCount;
    parameters[0].ShaderVisibility = D3D12_SHADER_VISIBILITY_ALL;
    parameters[1].ParameterType = D3D12_ROOT_PARAMETER_TYPE_DESCRIPTOR_TABLE;
    parameters[1].DescriptorTable.NumDescriptorRanges = 1;
    parameters[1].DescriptorTable.pDescriptorRanges = &ranges[0];
    parameters[1].ShaderVisibility = D3D12_SHADER_VISIBILITY_ALL;
    parameters[2].ParameterType = D3D12_ROOT_PARAMETER_TYPE_DESCRIPTOR_TABLE;
    parameters[2].DescriptorTable.NumDescriptorRanges = 1;
    parameters[2].DescriptorTable.pDescriptorRanges = &ranges[1];
    parameters[2].ShaderVisibility = D3D12_SHADER_VISIBILITY_ALL;

    D3D12_STATIC_SAMPLER_DESC sampler{};
    sampler.Filter = D3D12_FILTER_MIN_MAG_LINEAR_MIP_POINT;
    sampler.AddressU = D3D12_TEXTURE_ADDRESS_MODE_CLAMP;
    sampler.AddressV = D3D12_TEXTURE_ADDRESS_MODE_CLAMP;
    sampler.AddressW = D3D12_TEXTURE_ADDRESS_MODE_CLAMP;
    sampler.MipLODBias = 0;
    sampler.MaxAnisotropy = 1;
    sampler.ComparisonFunc = D3D12_COMPARISON_FUNC_ALWAYS;
    sampler.BorderColor = D3D12_STATIC_BORDER_COLOR_TRANSPARENT_BLACK;
    sampler.MinLOD = 0;
    sampler.MaxLOD = D3D12_FLOAT32_MAX;
    sampler.ShaderRegister = 0;
    sampler.RegisterSpace = 0;
    sampler.ShaderVisibility = D3D12_SHADER_VISIBILITY_ALL;

    D3D12_ROOT_SIGNATURE_DESC desc{};
    desc.NumParameters = 3;
    desc.pParameters = parameters;
    desc.NumStaticSamplers = 1;
    desc.pStaticSamplers = &sampler;
    desc.Flags = D3D12_ROOT_SIGNATURE_FLAG_NONE;
    ComPtr<ID3DBlob> serialized;
    ComPtr<ID3DBlob> errors;
    Check(D3D12SerializeRootSignature(&desc, D3D_ROOT_SIGNATURE_VERSION_1, &serialized, &errors), "D3D12SerializeRootSignature");
    ComPtr<ID3D12RootSignature> signature;
    Check(device->CreateRootSignature(0, serialized->GetBufferPointer(), serialized->GetBufferSize(), IID_PPV_ARGS(&signature)), "CreateRootSignature");
    return signature;
}

ComPtr<ID3D12PipelineState> CreatePipeline(ID3D12Device* device, ID3D12RootSignature* rootSignature, ID3DBlob* shader) {
    D3D12_COMPUTE_PIPELINE_STATE_DESC desc{};
    desc.pRootSignature = rootSignature;
    desc.CS.pShaderBytecode = shader->GetBufferPointer();
    desc.CS.BytecodeLength = shader->GetBufferSize();
    ComPtr<ID3D12PipelineState> pipeline;
    Check(device->CreateComputePipelineState(&desc, IID_PPV_ARGS(&pipeline)), "CreateComputePipelineState");
    return pipeline;
}

void CreateImageDescriptors(ID3D12Device* device, ID3D12DescriptorHeap* heap, UINT descriptorIncrement,
                            ID3D12Resource* input, ID3D12Resource* intermediate, ID3D12Resource* output) {
    const D3D12_CPU_DESCRIPTOR_HANDLE start = heap->GetCPUDescriptorHandleForHeapStart();
    auto cpu = [&](UINT index) {
        D3D12_CPU_DESCRIPTOR_HANDLE handle = start;
        handle.ptr += static_cast<SIZE_T>(descriptorIncrement) * index;
        return handle;
    };
    D3D12_SHADER_RESOURCE_VIEW_DESC srv{};
    srv.Shader4ComponentMapping = D3D12_DEFAULT_SHADER_4_COMPONENT_MAPPING;
    srv.Format = kImageFormat;
    srv.ViewDimension = D3D12_SRV_DIMENSION_TEXTURE2D;
    srv.Texture2D.MipLevels = 1;
    srv.Texture2D.MostDetailedMip = 0;
    device->CreateShaderResourceView(input, &srv, cpu(0));
    device->CreateShaderResourceView(intermediate, &srv, cpu(1));

    D3D12_UNORDERED_ACCESS_VIEW_DESC uav{};
    uav.Format = kImageFormat;
    uav.ViewDimension = D3D12_UAV_DIMENSION_TEXTURE2D;
    device->CreateUnorderedAccessView(intermediate, nullptr, &uav, cpu(2));
    device->CreateUnorderedAccessView(output, nullptr, &uav, cpu(3));
}

D3D12_GPU_DESCRIPTOR_HANDLE GpuDescriptor(ID3D12DescriptorHeap* heap, UINT descriptorIncrement, UINT index) {
    D3D12_GPU_DESCRIPTOR_HANDLE handle = heap->GetGPUDescriptorHandleForHeapStart();
    handle.ptr += static_cast<UINT64>(descriptorIncrement) * index;
    return handle;
}

void SaveReport(const fs::path& reportPath, const Adapter& adapter, const std::string& driverVersion,
                bool browserCapture, const fs::path& inputPath, const fs::path& referencePath, const fs::path& outputPath,
                UINT inputWidth, UINT inputHeight, UINT outputWidth, UINT outputHeight,
                bool gpuTimersAvailable, double easuGpuMs, double rcasGpuMs, double cpuSubmitWaitMs,
                double totalNativeMs, const ImageMetrics& metrics, uint64_t processedFrames) {
    const std::string adapterName = Utf8(adapter.description.Description);
    if (!reportPath.parent_path().empty()) fs::create_directories(reportPath.parent_path());
    std::ofstream json(reportPath, std::ios::binary);
    if (!json) throw std::runtime_error("Could not write native FSR report JSON.");
    const std::string inputCapturePath = PathUtf8(inputPath);
    const std::string referenceCapturePath = PathUtf8(referencePath);
    const std::string outputCapturePath = PathUtf8(outputPath);
    const std::string inputSource = browserCapture ? "Electron WebContents.capturePage() PNG" : "deterministic synthetic native pattern";
    json << "{\n"
         << "  \"status\": \"PASS\",\n"
         << "  \"technology\": \"AMD FidelityFX FSR 1.0.2 EASU + RCAS\",\n"
         << "  \"api\": \"Direct3D 12\",\n"
         << "  \"inputSource\": \"" << JsonEscape(inputSource) << "\",\n"
         << "  \"browserGraphicsPath\": \"" << (browserCapture ? "Chromium WebContentsView -> Electron capturePage PNG CPU readback -> app-owned D3D12 upload; no shared texture or compositor interop" : "not applicable to native synthetic regression") << "\",\n"
         << "  \"adapter\": \"" << JsonEscape(adapterName) << "\",\n"
         << "  \"adapterIndex\": " << (adapter.software ? -1 : static_cast<int>(adapter.selectionIndex)) << ",\n"
         << "  \"adapterVendorId\": \"0x" << std::hex << std::setw(4) << std::setfill('0') << adapter.description.VendorId << std::dec << "\",\n"
         << "  \"adapterDeviceId\": \"0x" << std::hex << std::setw(4) << std::setfill('0') << adapter.description.DeviceId << std::dec << "\",\n"
         << "  \"dedicatedVideoMemoryBytes\": " << adapter.description.DedicatedVideoMemory << ",\n"
         << "  \"softwareAdapter\": " << (adapter.software ? "true" : "false") << ",\n"
         << "  \"adapterType\": \"" << (adapter.software ? "D3D12 WARP software adapter" : "non-software D3D12 adapter (physical identity requires review)") << "\",\n"
         << "  \"featureLevel\": \"" << adapter.support.featureLevel << "\",\n"
         << "  \"shaderModel\": \"" << JsonEscape(adapter.support.shaderModel) << "\",\n"
         << "  \"fsr1RequiredFeaturesSupported\": " << (adapter.support.supportsFsr ? "true" : "false") << ",\n"
         << "  \"runtime\": \"AMD FSR 1.0.2 source; pinned upstream commit a21ffb8f6c13233ba336352bdff293894c706575\",\n"
         << "  \"initializationStatus\": \"PASS\",\n"
         << "  \"processingStatus\": \"PASS\",\n"
         << "  \"input\": {\"width\": " << inputWidth << ", \"height\": " << inputHeight << "},\n"
         << "  \"output\": {\"width\": " << outputWidth << ", \"height\": " << outputHeight << "},\n"
         << "  \"scaleFactor\": " << kScaleFactor << ",\n"
         << "  \"processedFrames\": " << processedFrames << ",\n"
         << "  \"gpuTimestampsAvailable\": " << (gpuTimersAvailable ? "true" : "false") << ",\n"
         << "  \"easuGpuTimeMs\": ";
    if (gpuTimersAvailable) json << std::fixed << std::setprecision(6) << easuGpuMs;
    else json << "null";
    json << ",\n  \"rcasGpuTimeMs\": ";
    if (gpuTimersAvailable) json << std::fixed << std::setprecision(6) << rcasGpuMs;
    else json << "null";
    json << ",\n"
         << "  \"cpuSubmitAndFenceWaitMs\": " << std::fixed << std::setprecision(6) << cpuSubmitWaitMs << ",\n"
         << "  \"nativeEndToEndMs\": " << std::fixed << std::setprecision(6) << totalNativeMs << ",\n"
         << "  \"meanAbsoluteDifferenceFromBilinear\": " << std::fixed << std::setprecision(6) << metrics.meanAbsoluteDifferenceFromBilinear << ",\n"
         << "  \"sampledRedChannelValues\": " << metrics.distinctSampledColors << ",\n"
         << "  \"minimumOutputSample\": " << static_cast<unsigned>(metrics.minimum) << ",\n"
         << "  \"maximumOutputSample\": " << static_cast<unsigned>(metrics.maximum) << ",\n"
         << "  \"checksum\": " << metrics.checksum << ",\n"
         << "  \"inputCapturePath\": \"" << JsonEscape(inputCapturePath) << "\",\n"
         << "  \"bilinearReferencePath\": \"" << JsonEscape(referenceCapturePath) << "\",\n"
         << "  \"processedCapturePath\": \"" << JsonEscape(outputCapturePath) << "\",\n"
         << "  \"images\": [\"" << JsonEscape(PathUtf8(inputPath.filename())) << "\", \"" << JsonEscape(PathUtf8(referencePath.filename())) << "\", \"" << JsonEscape(PathUtf8(outputPath.filename())) << "\"],\n"
         << "  \"physicalGpuGate\": \"" << (adapter.software ? "NOT RUN (WARP is software)" : "REVIEW REQUIRED (verify non-software adapter is physical)") << "\",\n"
         << "  \"amdVendorGate\": \"" << (adapter.description.VendorId == 0x1002 ? "AMD vendor ID reported; physical identity still requires review" : "NOT RUN (adapter vendor ID is not AMD)") << "\",\n"
         << "  \"driverVersion\": ";
    if (driverVersion.empty()) json << "null";
    else json << "\"" << JsonEscape(driverVersion) << "\"";
    json << ",\n"
         << "  \"driverVersionSource\": \"IDXGIAdapter::CheckInterfaceSupport(IDXGIDevice); raw user-mode interface version\",\n"
         << "  \"automaticDriverInstall\": false\n"
         << "}\n";
    if (!json) throw std::runtime_error("Failed while writing native FSR report JSON.");

    std::ofstream report(reportPath.parent_path() / "FSR1_NATIVE_REPORT.txt", std::ios::binary);
    if (!report) throw std::runtime_error("Could not write native FSR report text.");
    report << "TRI-CORE BROWSER — AMD FSR 1 NATIVE PROOF-OF-CONCEPT\n"
           << "Pipeline: AMD official FSR 1.0.2 EASU upscaling pass followed by RCAS sharpening pass.\n"
           << "API: Direct3D 12; input/output are app-owned GPU textures.\n"
           << "Input source: " << inputSource << "\n"
           << "Browser rendering path: " << (browserCapture ? "a WebContentsView screenshot was read back through Electron capturePage PNG and re-uploaded; this is not shared-texture or compositor interop." : "not applicable; this regression frame is synthetic.") << "\n"
           << "Adapter: " << adapterName << "\n"
           << "Vendor ID: 0x" << std::hex << adapter.description.VendorId << std::dec << "\n"
           << "Device ID: 0x" << std::hex << adapter.description.DeviceId << std::dec << "\n"
           << "Adapter type: " << (adapter.software ? "WARP software adapter" : "non-software DXGI adapter (physical identity unverified)") << "\n"
           << "D3D12 feature level: " << adapter.support.featureLevel << "; shader model: " << adapter.support.shaderModel << "\n"
           << "FSR initialization: PASS; frame processing: PASS\n"
           << "Input resolution: " << inputWidth << " x " << inputHeight << "\n"
           << "Output resolution: " << outputWidth << " x " << outputHeight << "\n"
           << "Processed test frames: " << processedFrames << "\n";
    if (gpuTimersAvailable) {
        report << "EASU GPU timestamp: " << std::fixed << std::setprecision(6) << easuGpuMs << " ms\n"
               << "RCAS GPU timestamp: " << rcasGpuMs << " ms\n";
    } else {
        report << "GPU timestamps: unavailable from this D3D12 command queue (not reported as zero).\n";
    }
    report << "CPU submit + fence wait: " << std::fixed << std::setprecision(6) << cpuSubmitWaitMs << " ms\n"
           << "Native process end-to-end: " << totalNativeMs << " ms\n"
           << "Mean absolute difference from CPU bilinear reference: " << metrics.meanAbsoluteDifferenceFromBilinear << "\n"
           << "Input capture: " << inputCapturePath << "\n"
           << "Bilinear reference: " << referenceCapturePath << "\n"
           << "Processed capture: " << outputCapturePath << "\n"
           << "Physical-GPU acceptance: " << (adapter.software ? "NOT RUN (WARP is software, not a physical GPU)." : "REVIEW REQUIRED (confirm the adapter is a physical device before accepting this gate).") << "\n"
           << "AMD vendor ID: " << (adapter.description.VendorId == 0x1002 ? "reported; physical device identity still requires review." : "not reported (vendor-specific AMD hardware gate NOT RUN).") << "\n"
           << "Driver interface version: " << (driverVersion.empty() ? "unavailable" : driverVersion + " (raw DXGI user-mode interface version)") << "\n"
           << "Automatic driver installation: NO.\n";
    if (!report) throw std::runtime_error("Failed while writing native FSR report text.");
}

void Run(const Options& options) {
    const auto nativeStart = std::chrono::steady_clock::now();
    const bool browserCapture = !options.inputPng.empty();
    fs::path inputPath;
    fs::path referencePath;
    fs::path outputPath;
    fs::path reportPath;
    FrameInput frame;

    if (browserCapture) {
        inputPath = options.inputPng;
        outputPath = options.outputPng;
        reportPath = options.reportJson;
        referencePath = options.outputPng.parent_path() /
            (options.outputPng.stem().wstring() + L"-bilinear-reference.png");
        frame = ReadPng(inputPath);
    } else {
        fs::create_directories(options.outputDirectory);
        frame.width = kSyntheticInputWidth;
        frame.height = kSyntheticInputHeight;
        frame.rgba = MakeInputScene(frame.width, frame.height);
        inputPath = options.outputDirectory / "input-scene.bmp";
        referencePath = options.outputDirectory / "bilinear-reference.bmp";
        outputPath = options.outputDirectory / "fsr1-easu-rcas.bmp";
        reportPath = options.outputDirectory / "fsr1-native-report.json";
    }

    const UINT inputWidth = frame.width;
    const UINT inputHeight = frame.height;
    if (inputWidth > std::numeric_limits<UINT>::max() / kScaleFactor || inputHeight > std::numeric_limits<UINT>::max() / kScaleFactor) {
        throw std::runtime_error("NOT RUN: input dimensions overflow the configured FSR1 output scale.");
    }
    const UINT outputWidth = inputWidth * kScaleFactor;
    const UINT outputHeight = inputHeight * kScaleFactor;
    const Adapter adapter = CreateAdapter(options.useWarp, options.adapterIndex);
    const fs::path shaderPath = ExecutableDirectory() / "amd" / "FSR_Pass.hlsl";
    if (!fs::exists(shaderPath)) throw std::runtime_error("FSR_Pass.hlsl or its licensed AMD includes are missing beside the executable.");

    const auto bilinearReference = MakeBilinearReference(frame.rgba, inputWidth, inputHeight, outputWidth, outputHeight);
    if (browserCapture) WritePng(referencePath, outputWidth, outputHeight, bilinearReference);
    else {
        WriteBmp(inputPath, inputWidth, inputHeight, frame.rgba);
        WriteBmp(referencePath, outputWidth, outputHeight, bilinearReference);
    }

    ComPtr<ID3D12CommandQueue> queue;
    D3D12_COMMAND_QUEUE_DESC queueDesc{};
    queueDesc.Type = D3D12_COMMAND_LIST_TYPE_DIRECT;
    Check(adapter.device->CreateCommandQueue(&queueDesc, IID_PPV_ARGS(&queue)), "CreateCommandQueue");
    ComPtr<ID3D12CommandAllocator> allocator;
    Check(adapter.device->CreateCommandAllocator(D3D12_COMMAND_LIST_TYPE_DIRECT, IID_PPV_ARGS(&allocator)), "CreateCommandAllocator");
    ComPtr<ID3D12GraphicsCommandList> commandList;
    Check(adapter.device->CreateCommandList(0, D3D12_COMMAND_LIST_TYPE_DIRECT, allocator.Get(), nullptr, IID_PPV_ARGS(&commandList)), "CreateCommandList");

    auto input = CreateTexture(adapter.device.Get(), inputWidth, inputHeight, D3D12_RESOURCE_FLAG_NONE, D3D12_RESOURCE_STATE_COPY_DEST);
    auto intermediate = CreateTexture(adapter.device.Get(), outputWidth, outputHeight, D3D12_RESOURCE_FLAG_ALLOW_UNORDERED_ACCESS, D3D12_RESOURCE_STATE_UNORDERED_ACCESS);
    auto output = CreateTexture(adapter.device.Get(), outputWidth, outputHeight, D3D12_RESOURCE_FLAG_ALLOW_UNORDERED_ACCESS, D3D12_RESOURCE_STATE_UNORDERED_ACCESS);

    const D3D12_RESOURCE_DESC inputDesc = TextureDescription(inputWidth, inputHeight, D3D12_RESOURCE_FLAG_NONE);
    D3D12_PLACED_SUBRESOURCE_FOOTPRINT inputFootprint{};
    UINT inputRows = 0;
    UINT64 inputRowSize = 0;
    UINT64 inputUploadBytes = 0;
    adapter.device->GetCopyableFootprints(&inputDesc, 0, 1, 0, &inputFootprint, &inputRows, &inputRowSize, &inputUploadBytes);
    auto upload = CreateBuffer(adapter.device.Get(), inputUploadBytes, D3D12_HEAP_TYPE_UPLOAD, D3D12_RESOURCE_STATE_GENERIC_READ);
    void* uploadMemory = nullptr;
    const D3D12_RANGE noRead{0, 0};
    Check(upload->Map(0, &noRead, &uploadMemory), "Map(input upload buffer)");
    for (UINT row = 0; row < inputHeight; ++row) {
        const auto* source = frame.rgba.data() + static_cast<size_t>(row) * inputWidth * 4;
        auto* destination = static_cast<uint8_t*>(uploadMemory) + inputFootprint.Offset + static_cast<size_t>(row) * inputFootprint.Footprint.RowPitch;
        std::copy_n(source, static_cast<size_t>(inputWidth) * 4, destination);
    }
    upload->Unmap(0, nullptr);

    ComPtr<ID3D12DescriptorHeap> descriptorHeap;
    D3D12_DESCRIPTOR_HEAP_DESC heapDesc{};
    heapDesc.Type = D3D12_DESCRIPTOR_HEAP_TYPE_CBV_SRV_UAV;
    heapDesc.NumDescriptors = kDescriptorCount;
    heapDesc.Flags = D3D12_DESCRIPTOR_HEAP_FLAG_SHADER_VISIBLE;
    Check(adapter.device->CreateDescriptorHeap(&heapDesc, IID_PPV_ARGS(&descriptorHeap)), "CreateDescriptorHeap");
    const UINT descriptorIncrement = adapter.device->GetDescriptorHandleIncrementSize(D3D12_DESCRIPTOR_HEAP_TYPE_CBV_SRV_UAV);
    CreateImageDescriptors(adapter.device.Get(), descriptorHeap.Get(), descriptorIncrement, input.Get(), intermediate.Get(), output.Get());

    ComPtr<ID3D12RootSignature> rootSignature = CreateRootSignature(adapter.device.Get());
    const auto easuBytecode = CompilePass(shaderPath, true);
    const auto rcasBytecode = CompilePass(shaderPath, false);
    ComPtr<ID3D12PipelineState> easuPipeline = CreatePipeline(adapter.device.Get(), rootSignature.Get(), easuBytecode.Get());
    ComPtr<ID3D12PipelineState> rcasPipeline = CreatePipeline(adapter.device.Get(), rootSignature.Get(), rcasBytecode.Get());

    ComPtr<ID3D12QueryHeap> queryHeap;
    D3D12_QUERY_HEAP_DESC queryDesc{};
    queryDesc.Type = D3D12_QUERY_HEAP_TYPE_TIMESTAMP;
    queryDesc.Count = 4;
    Check(adapter.device->CreateQueryHeap(&queryDesc, IID_PPV_ARGS(&queryHeap)), "CreateQueryHeap(timestamp)");
    auto queryReadback = CreateBuffer(adapter.device.Get(), sizeof(uint64_t) * 4, D3D12_HEAP_TYPE_READBACK, D3D12_RESOURCE_STATE_COPY_DEST);

    D3D12_TEXTURE_COPY_LOCATION inputDestination{};
    inputDestination.pResource = input.Get();
    inputDestination.Type = D3D12_TEXTURE_COPY_TYPE_SUBRESOURCE_INDEX;
    inputDestination.SubresourceIndex = 0;
    D3D12_TEXTURE_COPY_LOCATION uploadSource{};
    uploadSource.pResource = upload.Get();
    uploadSource.Type = D3D12_TEXTURE_COPY_TYPE_PLACED_FOOTPRINT;
    uploadSource.PlacedFootprint = inputFootprint;
    commandList->CopyTextureRegion(&inputDestination, 0, 0, 0, &uploadSource, nullptr);
    Transition(commandList.Get(), input.Get(), D3D12_RESOURCE_STATE_COPY_DEST, D3D12_RESOURCE_STATE_NON_PIXEL_SHADER_RESOURCE);
    ID3D12DescriptorHeap* heaps[] = { descriptorHeap.Get() };
    commandList->SetDescriptorHeaps(1, heaps);
    commandList->SetComputeRootSignature(rootSignature.Get());

    FsrConstants easuConstants{};
    FsrEasuCon(
        &easuConstants.values[0], &easuConstants.values[4], &easuConstants.values[8], &easuConstants.values[12],
        static_cast<AF1>(inputWidth), static_cast<AF1>(inputHeight),
        static_cast<AF1>(inputWidth), static_cast<AF1>(inputHeight),
        static_cast<AF1>(outputWidth), static_cast<AF1>(outputHeight));
    commandList->SetPipelineState(easuPipeline.Get());
    commandList->SetComputeRoot32BitConstants(0, kConstantCount, easuConstants.values, 0);
    commandList->SetComputeRootDescriptorTable(1, GpuDescriptor(descriptorHeap.Get(), descriptorIncrement, 0));
    commandList->SetComputeRootDescriptorTable(2, GpuDescriptor(descriptorHeap.Get(), descriptorIncrement, 2));
    commandList->EndQuery(queryHeap.Get(), D3D12_QUERY_TYPE_TIMESTAMP, 0);
    commandList->Dispatch((outputWidth + kWorkRegion - 1) / kWorkRegion, (outputHeight + kWorkRegion - 1) / kWorkRegion, 1);
    commandList->EndQuery(queryHeap.Get(), D3D12_QUERY_TYPE_TIMESTAMP, 1);
    Transition(commandList.Get(), intermediate.Get(), D3D12_RESOURCE_STATE_UNORDERED_ACCESS, D3D12_RESOURCE_STATE_NON_PIXEL_SHADER_RESOURCE);

    FsrConstants rcasConstants{};
    FsrRcasCon(&rcasConstants.values[0], 0.2f);
    commandList->SetPipelineState(rcasPipeline.Get());
    commandList->SetComputeRoot32BitConstants(0, kConstantCount, rcasConstants.values, 0);
    commandList->SetComputeRootDescriptorTable(1, GpuDescriptor(descriptorHeap.Get(), descriptorIncrement, 1));
    commandList->SetComputeRootDescriptorTable(2, GpuDescriptor(descriptorHeap.Get(), descriptorIncrement, 3));
    commandList->EndQuery(queryHeap.Get(), D3D12_QUERY_TYPE_TIMESTAMP, 2);
    commandList->Dispatch((outputWidth + kWorkRegion - 1) / kWorkRegion, (outputHeight + kWorkRegion - 1) / kWorkRegion, 1);
    commandList->EndQuery(queryHeap.Get(), D3D12_QUERY_TYPE_TIMESTAMP, 3);
    Transition(commandList.Get(), output.Get(), D3D12_RESOURCE_STATE_UNORDERED_ACCESS, D3D12_RESOURCE_STATE_COPY_SOURCE);

    const D3D12_RESOURCE_DESC outputDesc = TextureDescription(outputWidth, outputHeight, D3D12_RESOURCE_FLAG_NONE);
    D3D12_PLACED_SUBRESOURCE_FOOTPRINT outputFootprint{};
    UINT outputRows = 0;
    UINT64 outputRowSize = 0;
    UINT64 outputReadbackBytes = 0;
    adapter.device->GetCopyableFootprints(&outputDesc, 0, 1, 0, &outputFootprint, &outputRows, &outputRowSize, &outputReadbackBytes);
    auto outputReadback = CreateBuffer(adapter.device.Get(), outputReadbackBytes, D3D12_HEAP_TYPE_READBACK, D3D12_RESOURCE_STATE_COPY_DEST);
    D3D12_TEXTURE_COPY_LOCATION outputSource{};
    outputSource.pResource = output.Get();
    outputSource.Type = D3D12_TEXTURE_COPY_TYPE_SUBRESOURCE_INDEX;
    outputSource.SubresourceIndex = 0;
    D3D12_TEXTURE_COPY_LOCATION readbackDestination{};
    readbackDestination.pResource = outputReadback.Get();
    readbackDestination.Type = D3D12_TEXTURE_COPY_TYPE_PLACED_FOOTPRINT;
    readbackDestination.PlacedFootprint = outputFootprint;
    commandList->CopyTextureRegion(&readbackDestination, 0, 0, 0, &outputSource, nullptr);
    commandList->ResolveQueryData(queryHeap.Get(), D3D12_QUERY_TYPE_TIMESTAMP, 0, 4, queryReadback.Get(), 0);
    Check(commandList->Close(), "Close command list");
    std::cout << "FSR1_INITIALIZED\n" << std::flush;

    ComPtr<ID3D12Fence> fence;
    Check(adapter.device->CreateFence(0, D3D12_FENCE_FLAG_NONE, IID_PPV_ARGS(&fence)), "CreateFence");
    HANDLE fenceEvent = CreateEventW(nullptr, FALSE, FALSE, nullptr);
    if (!fenceEvent) throw std::runtime_error("CreateEventW for D3D12 fence failed.");
    ID3D12CommandList* commandLists[] = { commandList.Get() };
    const auto cpuStart = std::chrono::steady_clock::now();
    std::cout << "FSR1_PROCESSING\n" << std::flush;
    queue->ExecuteCommandLists(1, commandLists);
    Check(queue->Signal(fence.Get(), 1), "Signal(fence)");
    if (fence->GetCompletedValue() < 1) {
        Check(fence->SetEventOnCompletion(1, fenceEvent), "SetEventOnCompletion");
        if (WaitForSingleObject(fenceEvent, INFINITE) != WAIT_OBJECT_0) {
            CloseHandle(fenceEvent);
            throw std::runtime_error("Waiting for the D3D12 command queue failed.");
        }
    }
    const auto cpuEnd = std::chrono::steady_clock::now();
    CloseHandle(fenceEvent);
    const double cpuSubmitWaitMs = std::chrono::duration<double, std::milli>(cpuEnd - cpuStart).count();

    std::vector<uint8_t> outputPixels(static_cast<size_t>(outputWidth) * outputHeight * 4);
    void* outputMemory = nullptr;
    const D3D12_RANGE outputReadRange{0, static_cast<SIZE_T>(outputReadbackBytes)};
    Check(outputReadback->Map(0, &outputReadRange, &outputMemory), "Map(output readback)");
    for (UINT row = 0; row < outputHeight; ++row) {
        const auto* source = static_cast<const uint8_t*>(outputMemory) + outputFootprint.Offset + static_cast<size_t>(row) * outputFootprint.Footprint.RowPitch;
        auto* destination = outputPixels.data() + static_cast<size_t>(row) * outputWidth * 4;
        std::copy_n(source, static_cast<size_t>(outputWidth) * 4, destination);
    }
    const D3D12_RANGE noWrite{0, 0};
    outputReadback->Unmap(0, &noWrite);

    std::array<uint64_t, 4> timestamps{};
    void* queryMemory = nullptr;
    const D3D12_RANGE queryReadRange{0, sizeof(timestamps)};
    Check(queryReadback->Map(0, &queryReadRange, &queryMemory), "Map(timestamp readback)");
    std::copy_n(static_cast<const uint64_t*>(queryMemory), timestamps.size(), timestamps.begin());
    queryReadback->Unmap(0, &noWrite);
    UINT64 timestampFrequency = 0;
    const HRESULT frequencyResult = queue->GetTimestampFrequency(&timestampFrequency);
    const bool gpuTimersAvailable = SUCCEEDED(frequencyResult) && timestampFrequency != 0;
    const double easuGpuMs = gpuTimersAvailable
        ? static_cast<double>(timestamps[1] - timestamps[0]) * 1000.0 / timestampFrequency
        : 0.0;
    const double rcasGpuMs = gpuTimersAvailable
        ? static_cast<double>(timestamps[3] - timestamps[2]) * 1000.0 / timestampFrequency
        : 0.0;

    const ImageMetrics metrics = MeasureImage(outputPixels, bilinearReference);
    if (metrics.minimum == metrics.maximum || metrics.distinctSampledColors < 2 || metrics.absoluteDifferenceFromBilinear == 0) {
        throw std::runtime_error("Output validation failed: FSR produced a blank/constant image or matched the bilinear reference exactly.");
    }
    if (browserCapture) WritePng(outputPath, outputWidth, outputHeight, outputPixels);
    else WriteBmp(outputPath, outputWidth, outputHeight, outputPixels);
    const uint64_t processedFrames = 1;
    const double totalNativeMs = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - nativeStart).count();
    const std::string driverVersion = DriverInterfaceVersion(adapter);
    SaveReport(reportPath, adapter, driverVersion, browserCapture, inputPath, referencePath, outputPath,
               inputWidth, inputHeight, outputWidth, outputHeight, gpuTimersAvailable,
               easuGpuMs, rcasGpuMs, cpuSubmitWaitMs, totalNativeMs, metrics, processedFrames);
    std::cout << "PASS: official AMD FSR 1 EASU + RCAS D3D12 compute processed " << processedFrames
              << (browserCapture ? " browser-captured frame.\n" : " deterministic synthetic frame.\n")
              << "Adapter: " << Utf8(adapter.description.Description) << (adapter.software ? " (WARP SOFTWARE)" : " (non-software adapter; physical identity unverified)") << "\n"
              << "Input: " << inputWidth << 'x' << inputHeight << " -> output: " << outputWidth << 'x' << outputHeight << "\n";
    if (gpuTimersAvailable) {
        std::cout << "EASU GPU timestamp: " << std::fixed << std::setprecision(3) << easuGpuMs
                  << " ms; RCAS: " << rcasGpuMs << " ms; ";
    } else {
        std::cout << "GPU timestamps: unavailable; ";
    }
    std::cout << "CPU submit/fence: " << std::fixed << std::setprecision(3) << cpuSubmitWaitMs << " ms\n"
              << "Mean absolute difference vs bilinear: " << metrics.meanAbsoluteDifferenceFromBilinear << "\n"
              << "Native end-to-end: " << totalNativeMs << " ms\n"
              << "Images and report: " << PathUtf8(reportPath.parent_path()) << "\n"
              << (adapter.software ? "NOTE: WARP is software; physical-GPU acceptance remains NOT RUN.\n" : "NOTE: physical adapter identity and AMD-vendor acceptance remain separate review gates.\n");
}

} // namespace

int wmain(int argc, wchar_t** argv) {
    bool comInitialized = false;
    try {
        const Options options = ParseOptions(argc, argv);
        if (options.listAdapters) {
            PrintAdapters();
            return 0;
        }
        if (!options.inputPng.empty()) {
            const HRESULT comResult = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
            Check(comResult, "CoInitializeEx(WIC)");
            comInitialized = true;
        }
        Run(options);
        if (comInitialized) CoUninitialize();
        return 0;
    } catch (const std::exception& error) {
        if (comInitialized) CoUninitialize();
        const std::string message = error.what();
        std::cerr << message << '\n';
        return message.rfind("NOT RUN:", 0) == 0 ? 2 : 1;
    }
}
