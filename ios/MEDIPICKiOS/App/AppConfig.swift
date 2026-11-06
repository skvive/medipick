import Foundation

/// Reuses the verified production origin; never constructs arbitrary hosts from user input.
enum AppConfig {
    static let origin = URL(string: "https://medipick.lexid.site")!
    static let cityCenterLatitude = 37.5665
    static let cityCenterLongitude = 126.9780

    static func webURL(_ route: String) -> URL {
        precondition(route.hasPrefix("/") && !route.hasPrefix("//"))
        return origin.appending(path: String(route.dropFirst()))
    }
}
