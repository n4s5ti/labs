package main

import "C"

import (
	"unsafe"

	mygo "ilha-mygo/go"
)

// The c-shared FFI surface. Strings cross the boundary as NUL-terminated
// C strings; Describe uses a caller-provided buffer so no Go-allocated
// memory ever needs freeing on the Bun side.

//export MygoVersion
func MygoVersion() int64 { return mygo.Version }

//export MygoAdd
func MygoAdd(a, b int64) int64 { return a + b }

//export MygoReset
func MygoReset() { mygo.Reset() }

//export MygoCreate
func MygoCreate(kind *C.char) int64 { return mygo.Create(C.GoString(kind)) }

//export MygoSetProp
func MygoSetProp(id int64, key, value *C.char) int32 {
	if mygo.SetProp(id, C.GoString(key), C.GoString(value)) {
		return 1
	}
	return 0
}

//export MygoAttach
func MygoAttach(parent, child int64) int32 {
	if mygo.Attach(parent, child) {
		return 1
	}
	return 0
}

//export MygoDetach
func MygoDetach(parent, child int64) int32 {
	if mygo.Detach(parent, child) {
		return 1
	}
	return 0
}

//export MygoDelProp
func MygoDelProp(id int64, key *C.char) int32 {
	if mygo.DelProp(id, C.GoString(key)) {
		return 1
	}
	return 0
}

//export MygoRemove
func MygoRemove(id int64) int32 {
	if mygo.Remove(id) {
		return 1
	}
	return 0
}

//export MygoCount
func MygoCount() int64 { return int64(mygo.Count()) }

//export MygoDescribeInto
func MygoDescribeInto(id int64, buf *C.char, capLen int64) int64 {
	s, ok := mygo.Describe(id)
	if !ok {
		return -1
	}
	need := int64(len(s)) + 1 // bytes incl. NUL
	if need > capLen {
		return need
	}
	dst := (*[1 << 30]byte)(unsafe.Pointer(buf))[:need:need]
	copy(dst, s)
	dst[len(s)] = 0
	return int64(len(s))
}

func main() {}
