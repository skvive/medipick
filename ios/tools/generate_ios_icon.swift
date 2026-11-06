import AppKit
import Foundation

// macOS-only fallback: rebuild opaque 1024px icon from repository's verified PWA logo.
// Usage: swift generate_ios_icon.swift ../web/assets/pwa/icon-512.png MEDIPICKiOS/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png
let args = CommandLine.arguments
if args.count != 3 {
    fputs("Usage: swift generate_ios_icon.swift source.png output.png\n", stderr)
    exit(2)
}
let input = URL(fileURLWithPath: args[1]); let output = URL(fileURLWithPath: args[2])
guard let image = NSImage(contentsOf: input),
      let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 1024, pixelsHigh: 1024,
                               bitsPerSample: 8, samplesPerPixel: 3, hasAlpha: false,
                               isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0,
                               bitsPerPixel: 0) else {
    fputs("Missing or unsupported original MEDIPICK icon\n", stderr); exit(1)
}
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
NSColor(calibratedRed: 237/255, green: 246/255, blue: 1, alpha: 1).setFill()
NSRect(x: 0, y: 0, width: 1024, height: 1024).fill()
image.draw(in: NSRect(x: 0, y: 0, width: 1024, height: 1024))
NSGraphicsContext.restoreGraphicsState()
guard let data = rep.representation(using: .png, properties: [:]) else { exit(1) }
try FileManager.default.createDirectory(at: output.deletingLastPathComponent(), withIntermediateDirectories: true)
try data.write(to: output, options: .atomic)
