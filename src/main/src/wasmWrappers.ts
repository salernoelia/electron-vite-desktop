import Go from '../../../wasm_exec.js'
import wasm from '../../../wasm/main.wasm?url'

const go = new Go()

export const instance = async () => {
  try {
    // Fetch the WebAssembly binary
    const response = await fetch(wasm)
    if (!response.ok) {
      throw new Error(`Failed to fetch WASM module: ${response.statusText}`)
    }
    const wasmBuffer = await response.arrayBuffer()

    // Instantiate the WebAssembly module with the Go instance's importObject
    const wasmModule = await WebAssembly.instantiate(wasmBuffer, go.importObject)

    // Run the Go program
    await go.run(wasmModule.instance)

    console.log('WASM instantiated and Go program running successfully.')
    return { success: true }
  } catch (error) {
    console.error('Error instantiating WASM:', error)
    return { success: false, error: (error as Error).message }
  }
}
