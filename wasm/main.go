package main

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"strings"
	"syscall/js"
)

func main() {
	fmt.Println("WASM Module Instantiated")
	exports()
	
	// Block the main goroutine to keep the WASM module running
	select {}
}

func exports() {
	js.Global().Set("add", js.FuncOf(add))
	js.Global().Set("changeImageBrightness", js.FuncOf(changeImageBrightness))
}


func add(this js.Value, args []js.Value) interface{} {
	// Add all numbers provided as arguments and return the sum
	sum := 0
	for _, num := range args {
		sum += num.Int()
	}
	fmt.Println("Sum is:", sum)
	return sum
}

func changeImageBrightness(this js.Value, args []js.Value) interface{} {
	// Validate arguments
	if len(args) < 2 {
		js.Global().Call("console.error", "changeImageBrightness requires 2 arguments: image (Data URL) and brightness (number).")
		return nil
	}

	imageDataURL := args[0].String()
	brightness := args[1].Int() // Assuming brightness is an integer between -100 to 100

	// Validate brightness range
	if brightness < -100 || brightness > 100 {
		js.Global().Call("console.error", "Brightness must be between -100 and 100.")
		return nil
	}

	// Extract Base64 data from Data URL
	parts := strings.Split(imageDataURL, ",")
	if len(parts) != 2 {
		js.Global().Call("console.error", "Invalid Data URL format.")
		return nil
	}
	data, err := base64.StdEncoding.DecodeString(parts[1])
	if err != nil {
		js.Global().Call("console.error", "Failed to decode Base64 image data:", err.Error())
		return nil
	}

	// Determine image format
	var img image.Image
	var format string
	if strings.HasPrefix(parts[0], "data:image/png") {
		img, err = png.Decode(bytes.NewReader(data))
		format = "png"
	} else if strings.HasPrefix(parts[0], "data:image/jpeg") || strings.HasPrefix(parts[0], "data:image/jpg") {
		img, err = jpeg.Decode(bytes.NewReader(data))
		format = "jpeg"
	} else {
		js.Global().Call("console.error", "Unsupported image format. Only JPEG and PNG are supported.")
		return nil
	}
	if err != nil {
		js.Global().Call("console.error", "Failed to decode image:", err.Error())
		return nil
	}

	// Convert image to RGBA for manipulation
	bounds := img.Bounds()
	rgba := image.NewRGBA(bounds)
	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			originalColor := color.RGBAModel.Convert(img.At(x, y)).(color.RGBA)
			// Adjust brightness
			r := adjustBrightness(originalColor.R, brightness)
			g := adjustBrightness(originalColor.G, brightness)
			b := adjustBrightness(originalColor.B, brightness)
			rgba.Set(x, y, color.RGBA{R: r, G: g, B: b, A: originalColor.A})
		}
	}

	// Encode the image back to Data URL
	var buf bytes.Buffer
	switch format {
	case "png":
		err = png.Encode(&buf, rgba)
	case "jpeg":
		err = jpeg.Encode(&buf, rgba, &jpeg.Options{Quality: 95})
	default:
		js.Global().Call("console.error", "Unsupported image format during encoding.")
		return nil
	}
	if err != nil {
		js.Global().Call("console.error", "Failed to encode image:", err.Error())
		return nil
	}

	// Encode to Base64
	encoded := base64.StdEncoding.EncodeToString(buf.Bytes())
	// Reconstruct Data URL
	newDataURL := fmt.Sprintf("data:image/%s;base64,%s", format, encoded)

	// Optionally, log the operation
	fmt.Println("Image brightness changed by:", brightness)

	return newDataURL
}

// adjustBrightness adjusts a single color component based on the brightness value.
// brightness ranges from -100 to 100.
func adjustBrightness(c uint8, brightness int) uint8 {
	// Convert to float for manipulation
	fc := float64(c)
	// Calculate adjustment
	fc += (float64(brightness) / 100.0) * 255.0
	// Clamp the value between 0 and 255
	if fc < 0 {
		return 0
	}
	if fc > 255 {
		return 255
	}
	return uint8(fc)
}



