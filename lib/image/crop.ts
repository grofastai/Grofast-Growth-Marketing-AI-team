export type CropPixels = { x: number; y: number; width: number; height: number }

// Draws the given crop region of the source image onto a square canvas at
// outputSize x outputSize and exports it as a JPEG blob. Used to turn a
// react-easy-crop selection into the file that actually gets uploaded.
export function getCroppedImageBlob(
  imageSrc: string,
  cropPixels: CropPixels,
  outputSize: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement("canvas")
      canvas.width = outputSize
      canvas.height = outputSize
      const ctx = canvas.getContext("2d")
      if (!ctx) { reject(new Error("Canvas not supported")); return }
      ctx.drawImage(
        image,
        cropPixels.x, cropPixels.y, cropPixels.width, cropPixels.height,
        0, 0, outputSize, outputSize,
      )
      canvas.toBlob(
        blob => { blob ? resolve(blob) : reject(new Error("Failed to export cropped image")) },
        "image/jpeg",
        0.9,
      )
    }
    image.onerror = () => reject(new Error("Failed to load image"))
    image.src = imageSrc
  })
}
