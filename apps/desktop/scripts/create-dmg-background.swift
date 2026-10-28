// Run from apps/desktop: pnpm dmg:background
// The real app and Applications shortcut are placed by electron-builder;
// keep their centers aligned with the arrow at (170, 170) and (490, 170).
import AppKit

let output = URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent().deletingLastPathComponent()
    .appendingPathComponent("build")
try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)

for scale in [1, 2] {
    let bitmap = NSBitmapImageRep(
        bitmapDataPlanes: nil, pixelsWide: 660 * scale, pixelsHigh: 420 * scale,
        bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true,
        isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0
    )!
    bitmap.size = NSSize(width: 660, height: 420)
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)

    NSColor.white.setFill()
    NSRect(x: 0, y: 0, width: 660, height: 420).fill()

    // AppKit draws from the bottom left; Finder icon positions start at the top.
    let arrow = NSBezierPath()
    arrow.move(to: NSPoint(x: 270, y: 245))
    arrow.curve(to: NSPoint(x: 386, y: 245),
                controlPoint1: NSPoint(x: 310, y: 272),
                controlPoint2: NSPoint(x: 350, y: 272))
    arrow.move(to: NSPoint(x: 371, y: 271))
    arrow.line(to: NSPoint(x: 386, y: 245))
    arrow.line(to: NSPoint(x: 356, y: 245))
    arrow.lineWidth = 3
    arrow.lineCapStyle = .round
    arrow.lineJoinStyle = .round
    NSColor(calibratedRed: 0.24, green: 0.26, blue: 0.29, alpha: 1).setStroke()
    arrow.stroke()

    func text(_ value: String, y: CGFloat, size: CGFloat, color: NSColor, weight: NSFont.Weight) {
        let paragraph = NSMutableParagraphStyle()
        paragraph.alignment = .center
        (value as NSString).draw(
            in: NSRect(x: 30, y: y, width: 600, height: 36),
            withAttributes: [.font: NSFont.systemFont(ofSize: size, weight: weight),
                             .foregroundColor: color, .paragraphStyle: paragraph]
        )
    }
    text("将「Skillkit」拖入「应用程序」文件夹", y: 85, size: 23,
         color: NSColor(calibratedWhite: 0.15, alpha: 1), weight: .medium)
    text("Drag Skillkit to Applications to install", y: 52, size: 14,
         color: NSColor(calibratedWhite: 0.45, alpha: 1), weight: .regular)

    NSGraphicsContext.restoreGraphicsState()
    let suffix = scale == 1 ? "" : "@2x"
    let file = output.appendingPathComponent("dmg-background\(suffix).png")
    try bitmap.representation(using: .png, properties: [:])!.write(to: file)
    print("Created \(file.path)")
}
