package main

import "C"

import (
	"unsafe"

	core "ilha-asuka/go"
)

// The c-shared FFI surface over the Asuka-protocol store. Node handles
// are int64 (0 is never valid); kinds, props and events are Asuka's
// numeric schema IDs. Strings cross as NUL-terminated C strings;
// Describe and Ops use a caller-provided buffer so no Go-allocated
// memory ever needs freeing on the Bun side.

//export AsukaVersion
func AsukaVersion() int64 { return core.Version }

//export AsukaReset
func AsukaReset() { core.Reset() }

//export AsukaCreate
func AsukaCreate(kind int32) int64 { return core.Create(core.Kind(kind)) }

//export AsukaSetString
func AsukaSetString(id int64, prop int32, value *C.char) int32 {
	if core.SetString(id, core.PropID(prop), C.GoString(value)) {
		return 1
	}
	return 0
}

//export AsukaSetInt
func AsukaSetInt(id int64, prop int32, value int64) int32 {
	if core.SetInt(id, core.PropID(prop), value) {
		return 1
	}
	return 0
}

//export AsukaSetFloat
func AsukaSetFloat(id int64, prop int32, value float64) int32 {
	if core.SetFloat(id, core.PropID(prop), value) {
		return 1
	}
	return 0
}

//export AsukaSetBool
func AsukaSetBool(id int64, prop int32, value int32) int32 {
	if core.SetBool(id, core.PropID(prop), value != 0) {
		return 1
	}
	return 0
}

//export AsukaSetEnum
func AsukaSetEnum(id int64, prop int32, value int32) int32 {
	if core.SetEnum(id, core.PropID(prop), value) {
		return 1
	}
	return 0
}

//export AsukaSetStyle
func AsukaSetStyle(id int64, key, value *C.char) int32 {
	if core.SetStyle(id, C.GoString(key), C.GoString(value)) {
		return 1
	}
	return 0
}

//export AsukaSetAttr
func AsukaSetAttr(id int64, key, value *C.char) int32 {
	if core.SetAttr(id, C.GoString(key), C.GoString(value)) {
		return 1
	}
	return 0
}

//export AsukaDelProp
func AsukaDelProp(id int64, key *C.char) int32 {
	if core.DelProp(id, C.GoString(key)) {
		return 1
	}
	return 0
}

//export AsukaInsert
func AsukaInsert(parent, child int64, index int32) int32 {
	if core.Insert(parent, child, int(index)) {
		return 1
	}
	return 0
}

//export AsukaRemove
func AsukaRemove(parent, child int64) int32 {
	if core.Remove(parent, child) {
		return 1
	}
	return 0
}

//export AsukaDestroy
func AsukaDestroy(id int64) int32 {
	if core.Destroy(id) {
		return 1
	}
	return 0
}

//export AsukaListen
func AsukaListen(id int64, event int32) int32 {
	if core.Listen(id, core.Event(event)) {
		return 1
	}
	return 0
}

//export AsukaUnlisten
func AsukaUnlisten(id int64, event int32) int32 {
	if core.Unlisten(id, core.Event(event)) {
		return 1
	}
	return 0
}

//export AsukaSetRoot
func AsukaSetRoot(id int64) int32 {
	if core.SetRoot(id) {
		return 1
	}
	return 0
}

//export AsukaLayout
func AsukaLayout(root int64, w, h float32) int32 {
	return int32(core.Layout(root, w, h))
}

//export AsukaCount
func AsukaCount() int64 { return int64(core.Count()) }

func copyOut(s string, buf *C.char, capLen int64) int64 {
	need := int64(len(s)) + 1 // bytes incl. NUL
	if need > capLen {
		return need
	}
	dst := (*[1 << 30]byte)(unsafe.Pointer(buf))[:need:need]
	copy(dst, s)
	dst[len(s)] = 0
	return int64(len(s))
}

//export AsukaDescribeInto
func AsukaDescribeInto(id int64, buf *C.char, capLen int64) int64 {
	s, ok := core.Describe(id)
	if !ok {
		return -1
	}
	return copyOut(s, buf, capLen)
}

//export AsukaOpsInto
func AsukaOpsInto(buf *C.char, capLen int64) int64 {
	lines := core.Ops()
	s := ""
	for i, line := range lines {
		if i > 0 {
			s += "\n"
		}
		s += line
	}
	return copyOut(s, buf, capLen)
}

func main() {}
