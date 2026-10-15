;; Exact source for the checked-in instruction bytes in src/wasm-benchmark.js.
;; This module is intentionally small: the browser verifies add(19, 23) = 42.
(module
  (type $add_i32 (func (param i32 i32) (result i32)))
  (func $add (type $add_i32) (param $left i32) (param $right i32) (result i32)
    local.get $left
    local.get $right
    i32.add)
  (export "add" (func $add)))
