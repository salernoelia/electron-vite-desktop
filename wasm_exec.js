// wasm_exec.js
'use strict'

// Polyfill checks
if (typeof TextEncoder === 'undefined' || typeof TextDecoder === 'undefined') {
  throw new Error('TextEncoder/TextDecoder is not available, polyfill required')
}

if (typeof crypto === 'undefined' || !crypto.getRandomValues) {
  throw new Error('crypto.getRandomValues is not available, polyfill required')
}

if (typeof performance === 'undefined' || !performance.now) {
  throw new Error('performance.now is not available, polyfill required')
}

// Helper function to create ENOSYS error
const enosys = () => {
  const err = new Error('not implemented')
  err.code = 'ENOSYS'
  return err
}

// Polyfill for fs if not present
let outputBuf = ''
const fs = {
  constants: {
    O_WRONLY: -1,
    O_RDWR: -1,
    O_CREAT: -1,
    O_TRUNC: -1,
    O_APPEND: -1,
    O_EXCL: -1
  }, // unused constants
  writeSync(fd, buf) {
    const decoder = new TextDecoder('utf-8')
    outputBuf += decoder.decode(buf)
    const nl = outputBuf.lastIndexOf('\n')
    if (nl !== -1) {
      console.log(outputBuf.substring(0, nl))
      outputBuf = outputBuf.substring(nl + 1)
    }
    return buf.length
  },
  write(fd, buf, offset, length, position, callback) {
    if (offset !== 0 || length !== buf.length || position !== null) {
      callback(enosys())
      return
    }
    const n = this.writeSync(fd, buf)
    callback(null, n)
  },
  chmod(path, mode, callback) {
    callback(enosys())
  },
  chown(path, uid, gid, callback) {
    callback(enosys())
  },
  close(fd, callback) {
    callback(enosys())
  },
  fchmod(fd, mode, callback) {
    callback(enosys())
  },
  fchown(fd, uid, gid, callback) {
    callback(enosys())
  },
  fstat(fd, callback) {
    callback(enosys())
  },
  fsync(fd, callback) {
    callback(null)
  },
  ftruncate(fd, length, callback) {
    callback(enosys())
  },
  lchown(path, uid, gid, callback) {
    callback(enosys())
  },
  link(path, link, callback) {
    callback(enosys())
  },
  lstat(path, callback) {
    callback(enosys())
  },
  mkdir(path, perm, callback) {
    callback(enosys())
  },
  open(path, flags, mode, callback) {
    callback(enosys())
  },
  read(fd, buffer, offset, length, position, callback) {
    callback(enosys())
  },
  readdir(path, callback) {
    callback(enosys())
  },
  readlink(path, callback) {
    callback(enosys())
  },
  rename(from, to, callback) {
    callback(enosys())
  },
  rmdir(path, callback) {
    callback(enosys())
  },
  stat(path, callback) {
    callback(enosys())
  },
  symlink(path, link, callback) {
    callback(enosys())
  },
  truncate(path, length, callback) {
    callback(enosys())
  },
  unlink(path, callback) {
    callback(enosys())
  },
  utimes(path, atime, mtime, callback) {
    callback(enosys())
  }
}

// Polyfill for process if not present
const process = {
  getuid() {
    return -1
  },
  getgid() {
    return -1
  },
  geteuid() {
    return -1
  },
  getegid() {
    return -1
  },
  getgroups() {
    throw enosys()
  },
  pid: -1,
  ppid: -1,
  umask() {
    throw enosys()
  },
  cwd() {
    throw enosys()
  },
  chdir() {
    throw enosys()
  }
}

/**
 * The Go class provides an interface to run Go-compiled WebAssembly modules.
 */
export default class Go {
  constructor() {
    this.argv = ['js']
    this.env = {}
    this.exit = (code) => {
      if (code !== 0) {
        console.warn('exit code:', code)
      }
    }
    this._exitPromise = new Promise((resolve) => {
      this._resolveExitPromise = resolve
    })
    this._pendingEvent = null
    this._scheduledTimeouts = new Map()
    this._nextCallbackTimeoutID = 1

    const encoder = new TextEncoder('utf-8')
    const decoder = new TextDecoder('utf-8')

    // Initialize globalThis.fs and globalThis.process if not present
    if (!globalThis.fs) {
      globalThis.fs = fs
    }

    if (!globalThis.process) {
      globalThis.process = process
    }

    if (!globalThis.crypto) {
      throw new Error(
        'globalThis.crypto is not available, polyfill required (crypto.getRandomValues only)'
      )
    }

    if (!globalThis.performance) {
      throw new Error(
        'globalThis.performance is not available, polyfill required (performance.now only)'
      )
    }

    if (!globalThis.TextEncoder) {
      throw new Error('globalThis.TextEncoder is not available, polyfill required')
    }

    if (!globalThis.TextDecoder) {
      throw new Error('globalThis.TextDecoder is not available, polyfill required')
    }

    this.encoder = encoder
    this.decoder = decoder

    this.importObject = {
      _gotest: {
        add: (a, b) => a + b
      },
      gojs: {
        // Runtime functions that interface with Go's WebAssembly runtime
        'runtime.wasmExit': (sp) => {
          sp >>>= 0
          const code = this.mem.getInt32(sp + 8, true)
          this.exited = true
          delete this._inst
          delete this._values
          delete this._goRefCounts
          delete this._ids
          delete this._idPool
          this.exit(code)
        },

        'runtime.wasmWrite': (sp) => {
          sp >>>= 0
          const fd = getInt64(sp + 8)
          const p = getInt64(sp + 16)
          const n = this.mem.getInt32(sp + 24, true)
          fs.writeSync(fd, new Uint8Array(this._inst.exports.mem.buffer, p, n))
        },

        'runtime.resetMemoryDataView': (sp) => {
          sp >>>= 0
          this.mem = new DataView(this._inst.exports.mem.buffer)
        },

        'runtime.nanotime1': (sp) => {
          sp >>>= 0
          setInt64(sp + 8, (timeOrigin + performance.now()) * 1000000)
        },

        'runtime.walltime': (sp) => {
          sp >>>= 0
          const msec = new Date().getTime()
          setInt64(sp + 8, Math.floor(msec / 1000))
          this.mem.setInt32(sp + 16, (msec % 1000) * 1000000, true)
        },

        'runtime.scheduleTimeoutEvent': (sp) => {
          sp >>>= 0
          const id = this._nextCallbackTimeoutID++
          const delay = getInt64(sp + 8)
          const timeoutID = setTimeout(() => {
            this._resume()
            while (this._scheduledTimeouts.has(id)) {
              console.warn('scheduleTimeoutEvent: missed timeout event')
              this._resume()
            }
          }, delay)
          this._scheduledTimeouts.set(id, timeoutID)
          this.mem.setInt32(sp + 16, id, true)
        },

        'runtime.clearTimeoutEvent': (sp) => {
          sp >>>= 0
          const id = this.mem.getInt32(sp + 8, true)
          clearTimeout(this._scheduledTimeouts.get(id))
          this._scheduledTimeouts.delete(id)
        },

        'runtime.getRandomData': (sp) => {
          sp >>>= 0
          crypto.getRandomValues(this.loadSlice(sp + 8))
        },

        'syscall/js.finalizeRef': (sp) => {
          sp >>>= 0
          const id = this.mem.getUint32(sp + 8, true)
          this._goRefCounts[id]--
          if (this._goRefCounts[id] === 0) {
            const v = this._values[id]
            this._values[id] = null
            this._ids.delete(v)
            this._idPool.push(id)
          }
        },

        'syscall/js.stringVal': (sp) => {
          sp >>>= 0
          this.storeValue(sp + 24, this.loadString(sp + 8))
        },

        'syscall/js.valueGet': (sp) => {
          sp >>>= 0
          const result = Reflect.get(this.loadValue(sp + 8), this.loadString(sp + 16))
          sp = this._inst.exports.getsp() >>> 0
          this.storeValue(sp + 32, result)
        },

        'syscall/js.valueSet': (sp) => {
          sp >>>= 0
          Reflect.set(this.loadValue(sp + 8), this.loadString(sp + 16), this.loadValue(sp + 32))
        },

        'syscall/js.valueDelete': (sp) => {
          sp >>>= 0
          Reflect.deleteProperty(this.loadValue(sp + 8), this.loadString(sp + 16))
        },

        'syscall/js.valueIndex': (sp) => {
          sp >>>= 0
          this.storeValue(sp + 24, Reflect.get(this.loadValue(sp + 8), this.getInt64(sp + 16)))
        },

        'syscall/js.valueSetIndex': (sp) => {
          sp >>>= 0
          Reflect.set(this.loadValue(sp + 8), this.getInt64(sp + 16), this.loadValue(sp + 24))
        },

        'syscall/js.valueCall': (sp) => {
          sp >>>= 0
          try {
            const v = this.loadValue(sp + 8)
            const m = Reflect.get(v, this.loadString(sp + 16))
            const args = this.loadSliceOfValues(sp + 32)
            const result = Reflect.apply(m, v, args)
            sp = this._inst.exports.getsp() >>> 0
            this.storeValue(sp + 56, result)
            this.mem.setUint8(sp + 64, 1)
          } catch (err) {
            sp = this._inst.exports.getsp() >>> 0
            this.storeValue(sp + 56, err)
            this.mem.setUint8(sp + 64, 0)
          }
        },

        'syscall/js.valueInvoke': (sp) => {
          sp >>>= 0
          try {
            const v = this.loadValue(sp + 8)
            const args = this.loadSliceOfValues(sp + 16)
            const result = Reflect.apply(v, undefined, args)
            sp = this._inst.exports.getsp() >>> 0
            this.storeValue(sp + 40, result)
            this.mem.setUint8(sp + 48, 1)
          } catch (err) {
            sp = this._inst.exports.getsp() >>> 0
            this.storeValue(sp + 40, err)
            this.mem.setUint8(sp + 48, 0)
          }
        },

        'syscall/js.valueNew': (sp) => {
          sp >>>= 0
          try {
            const v = this.loadValue(sp + 8)
            const args = this.loadSliceOfValues(sp + 16)
            const result = Reflect.construct(v, args)
            sp = this._inst.exports.getsp() >>> 0
            this.storeValue(sp + 40, result)
            this.mem.setUint8(sp + 48, 1)
          } catch (err) {
            sp = this._inst.exports.getsp() >>> 0
            this.storeValue(sp + 40, err)
            this.mem.setUint8(sp + 48, 0)
          }
        },

        'syscall/js.valueLength': (sp) => {
          sp >>>= 0
          this.setInt64(sp + 16, parseInt(this.loadValue(sp + 8).length))
        },

        'syscall/js.valuePrepareString': (sp) => {
          sp >>>= 0
          const str = this.encoder.encode(String(this.loadValue(sp + 8)))
          this.storeValue(sp + 16, str)
          this.setInt64(sp + 24, str.length)
        },

        'syscall/js.valueLoadString': (sp) => {
          sp >>>= 0
          const str = this.loadValue(sp + 8)
          this.loadSlice(sp + 16).set(str)
        },

        'syscall/js.valueInstanceOf': (sp) => {
          sp >>>= 0
          this.mem.setUint8(
            sp + 24,
            this.loadValue(sp + 8) instanceof this.loadValue(sp + 16) ? 1 : 0
          )
        },

        'syscall/js.copyBytesToGo': (sp) => {
          sp >>>= 0
          const dst = this.loadSlice(sp + 8)
          const src = this.loadValue(sp + 32)
          if (!(src instanceof Uint8Array || src instanceof Uint8ClampedArray)) {
            this.mem.setUint8(sp + 48, 0)
            return
          }
          const toCopy = src.subarray(0, dst.length)
          dst.set(toCopy)
          this.setInt64(sp + 40, toCopy.length)
          this.mem.setUint8(sp + 48, 1)
        },

        'syscall/js.copyBytesToJS': (sp) => {
          sp >>>= 0
          const dst = this.loadValue(sp + 8)
          const src = this.loadSlice(sp + 16)
          if (!(dst instanceof Uint8Array || dst instanceof Uint8ClampedArray)) {
            this.mem.setUint8(sp + 48, 0)
            return
          }
          const toCopy = src.subarray(0, dst.length)
          dst.set(toCopy)
          this.setInt64(sp + 40, toCopy.length)
          this.mem.setUint8(sp + 48, 1)
        },

        debug: (value) => {
          console.log(value)
        }
      }
    }

    // Helper functions for the Go class
    const setInt64 = (addr, v) => {
      this.mem.setUint32(addr + 0, v, true)
      this.mem.setUint32(addr + 4, Math.floor(v / 4294967296), true)
    }

    const setInt32 = (addr, v) => {
      this.mem.setUint32(addr + 0, v, true)
    }

    const getInt64 = (addr) => {
      const low = this.mem.getUint32(addr + 0, true)
      const high = this.mem.getInt32(addr + 4, true)
      return low + high * 4294967296
    }

    this.loadValue = (addr) => {
      const f = this.mem.getFloat64(addr, true)
      if (f === 0) {
        return undefined
      }
      if (!isNaN(f)) {
        return f
      }

      const id = this.mem.getUint32(addr, true)
      return this._values[id]
    }

    this.storeValue = (addr, v) => {
      const nanHead = 0x7ff80000

      if (typeof v === 'number' && v !== 0) {
        if (isNaN(v)) {
          this.mem.setUint32(addr + 4, nanHead, true)
          this.mem.setUint32(addr, 0, true)
          return
        }
        this.mem.setFloat64(addr, v, true)
        return
      }

      if (v === undefined) {
        this.mem.setFloat64(addr, 0, true)
        return
      }

      let id = this._ids.get(v)
      if (id === undefined) {
        id = this._idPool.pop()
        if (id === undefined) {
          id = this._values.length
        }
        this._values[id] = v
        this._goRefCounts[id] = 0
        this._ids.set(v, id)
      }
      this._goRefCounts[id]++
      let typeFlag = 0
      switch (typeof v) {
        case 'object':
          if (v !== null) {
            typeFlag = 1
          }
          break
        case 'string':
          typeFlag = 2
          break
        case 'symbol':
          typeFlag = 3
          break
        case 'function':
          typeFlag = 4
          break
      }
      this.mem.setUint32(addr + 4, nanHead | typeFlag, true)
      this.mem.setUint32(addr, id, true)
    }

    this.loadSlice = (addr) => {
      const array = getInt64(addr + 0)
      const len = getInt64(addr + 8)
      return new Uint8Array(this._inst.exports.mem.buffer, array, len)
    }

    this.loadSliceOfValues = (addr) => {
      const array = getInt64(addr + 0)
      const len = getInt64(addr + 8)
      const a = new Array(len)
      for (let i = 0; i < len; i++) {
        a[i] = this.loadValue(array + i * 8)
      }
      return a
    }

    this.loadString = (addr) => {
      const saddr = getInt64(addr + 0)
      const len = getInt64(addr + 8)
      return this.decoder.decode(new DataView(this._inst.exports.mem.buffer, saddr, len))
    }

    // Initialize importObject.gojs functions
    this.importObject.gojs = this.importObject.gojs

    // Time origin for nanotime
    const timeOrigin = Date.now() - performance.now()

    // Initialize other necessary properties
    this._values = [
      // JS values that Go currently has references to, indexed by reference id
      NaN,
      0,
      null,
      true,
      false,
      globalThis,
      this
    ]
    this._goRefCounts = new Array(this._values.length).fill(Infinity) // Reference counts
    this._ids = new Map([
      [0, 1],
      [null, 2],
      [true, 3],
      [false, 4],
      [globalThis, 5],
      [this, 6]
    ])
    this._idPool = [] // Pool of available IDs
    this.exited = false // Exit flag
  }

  /**
   * Runs the Go program contained within the provided WebAssembly instance.
   * @param {WebAssembly.Instance} instance - The WebAssembly instance to run.
   */
  async run(instance) {
    if (!(instance instanceof WebAssembly.Instance)) {
      throw new Error('Go.run: WebAssembly.Instance expected')
    }
    this._inst = instance
    this.mem = new DataView(this._inst.exports.mem.buffer)
    this.exited = false

    // Pass command line arguments and environment variables to WebAssembly
    let offset = 4096
    const argvPtrs = []

    const strPtr = (str) => {
      const bytes = this.encoder.encode(str + '\0')
      const ptr = offset
      new Uint8Array(this.mem.buffer, offset, bytes.length).set(bytes)
      offset += bytes.length
      if (offset % 8 !== 0) {
        offset += 8 - (offset % 8)
      }
      return ptr
    }

    // Encode command line arguments
    for (const arg of this.argv) {
      argvPtrs.push(strPtr(arg))
    }
    argvPtrs.push(0) // Null terminator

    // Encode environment variables
    const keys = Object.keys(this.env).sort()
    for (const key of keys) {
      argvPtrs.push(strPtr(`${key}=${this.env[key]}`))
    }
    argvPtrs.push(0) // Null terminator

    // Write argv and env pointers to memory
    const argv = offset
    for (const ptr of argvPtrs) {
      this.mem.setUint32(offset, ptr, true)
      this.mem.setUint32(offset + 4, 0, true)
      offset += 8
    }

    // Ensure we don't exceed memory limits
    const wasmMinDataAddr = 4096 + 8192
    if (offset >= wasmMinDataAddr) {
      throw new Error('total length of command line and environment variables exceeds limit')
    }

    // Run the Go program
    this._inst.exports.run(this.argv.length, argv)
    if (this.exited) {
      this._resolveExitPromise()
    }
    await this._exitPromise
  }

  /**
   * Resumes the Go program execution.
   */
  _resume() {
    if (this.exited) {
      throw new Error('Go program has already exited')
    }
    this._inst.exports.resume()
    if (this.exited) {
      this._resolveExitPromise()
    }
  }

  /**
   * Creates a function wrapper for Go callbacks.
   * @param {number} id - The identifier for the callback.
   * @returns {Function} The wrapped function.
   */
  _makeFuncWrapper(id) {
    const go = this
    return function () {
      const event = { id: id, this: this, args: arguments }
      go._pendingEvent = event
      go._resume()
      return event.result
    }
  }

  // Helper methods

  /**
   * Sets a 64-bit integer at the specified memory address.
   * @param {number} addr - The memory address.
   * @param {number} v - The value to set.
   */
  setInt64(addr, v) {
    this.mem.setUint32(addr + 0, v, true)
    this.mem.setUint32(addr + 4, Math.floor(v / 4294967296), true)
  }

  /**
   * Retrieves a 64-bit integer from the specified memory address.
   * @param {number} addr - The memory address.
   * @returns {number} The retrieved value.
   */
  getInt64(addr) {
    const low = this.mem.getUint32(addr + 0, true)
    const high = this.mem.getInt32(addr + 4, true)
    return low + high * 4294967296
  }

  /**
   * Loads a JavaScript value from the WebAssembly memory.
   * @param {number} addr - The memory address.
   * @returns {*} The loaded value.
   */
  loadValue(addr) {
    const f = this.mem.getFloat64(addr, true)
    if (f === 0) {
      return undefined
    }
    if (!isNaN(f)) {
      return f
    }

    const id = this.mem.getUint32(addr, true)
    return this._values[id]
  }

  /**
   * Stores a JavaScript value into the WebAssembly memory.
   * @param {number} addr - The memory address.
   * @param {*} v - The value to store.
   */
  storeValue(addr, v) {
    const nanHead = 0x7ff80000

    if (typeof v === 'number' && v !== 0) {
      if (isNaN(v)) {
        this.mem.setUint32(addr + 4, nanHead, true)
        this.mem.setUint32(addr, 0, true)
        return
      }
      this.mem.setFloat64(addr, v, true)
      return
    }

    if (v === undefined) {
      this.mem.setFloat64(addr, 0, true)
      return
    }

    let id = this._ids.get(v)
    if (id === undefined) {
      id = this._idPool.pop()
      if (id === undefined) {
        id = this._values.length
      }
      this._values[id] = v
      this._goRefCounts[id] = 0
      this._ids.set(v, id)
    }
    this._goRefCounts[id]++
    let typeFlag = 0
    switch (typeof v) {
      case 'object':
        if (v !== null) {
          typeFlag = 1
        }
        break
      case 'string':
        typeFlag = 2
        break
      case 'symbol':
        typeFlag = 3
        break
      case 'function':
        typeFlag = 4
        break
    }
    this.mem.setUint32(addr + 4, nanHead | typeFlag, true)
    this.mem.setUint32(addr, id, true)
  }

  /**
   * Loads a byte slice from the WebAssembly memory.
   * @param {number} addr - The memory address.
   * @returns {Uint8Array} The loaded byte slice.
   */
  loadSlice(addr) {
    const array = this.getInt64(addr + 0)
    const len = this.getInt64(addr + 8)
    return new Uint8Array(this._inst.exports.mem.buffer, array, len)
  }

  /**
   * Loads a slice of JavaScript values from the WebAssembly memory.
   * @param {number} addr - The memory address.
   * @returns {Array} The loaded slice of values.
   */
  loadSliceOfValues(addr) {
    const array = this.getInt64(addr + 0)
    const len = this.getInt64(addr + 8)
    const a = new Array(len)
    for (let i = 0; i < len; i++) {
      a[i] = this.loadValue(array + i * 8)
    }
    return a
  }

  /**
   * Loads a string from the WebAssembly memory.
   * @param {number} addr - The memory address.
   * @returns {string} The loaded string.
   */
  loadString(addr) {
    const saddr = this.getInt64(addr + 0)
    const len = this.getInt64(addr + 8)
    return this.decoder.decode(new DataView(this._inst.exports.mem.buffer, saddr, len))
  }
}
