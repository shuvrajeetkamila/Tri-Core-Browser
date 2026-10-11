cmake_minimum_required(VERSION 3.21)
project(TriCoreFsr1Poc LANGUAGES CXX)

if(NOT WIN32)
  message(FATAL_ERROR "The isolated FSR1 proof-of-concept uses the Windows Direct3D 12 API.")
endif()

add_executable(TriCoreFsr1Poc Fsr1Poc.cpp)
target_compile_features(TriCoreFsr1Poc PRIVATE cxx_std_17)
target_compile_definitions(TriCoreFsr1Poc PRIVATE WIN32_LEAN_AND_MEAN NOMINMAX)
target_compile_options(TriCoreFsr1Poc PRIVATE /W4 /EHsc)
target_link_libraries(TriCoreFsr1Poc PRIVATE d3d12 dxgi d3dcompiler)

# The official AMD shader wrapper includes its two upstream headers by filename.
# Keep the pinned, licensed shader inputs together beside the executable.
add_custom_command(TARGET TriCoreFsr1Poc POST_BUILD
  COMMAND "${CMAKE_COMMAND}" -E make_directory "$<TARGET_FILE_DIR:TriCoreFsr1Poc>/amd"
  COMMAND "${CMAKE_COMMAND}" -E copy_directory
          "${CMAKE_CURRENT_SOURCE_DIR}/third_party/amd"
          "$<TARGET_FILE_DIR:TriCoreFsr1Poc>/amd"
  VERBATIM
)

message(STATUS "Tri-Core FSR1 POC is a separate synthetic-texture D3D12 harness; it does not hook Chromium or other processes.")
