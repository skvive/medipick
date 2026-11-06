import Foundation
import CoreLocation

struct CatalogAPI {
    enum Failure: LocalizedError {
        case invalidResponse
        case http(Int)
        case decoding
        var errorDescription: String? {
            switch self {
            case .invalidResponse: return "서버 응답을 확인할 수 없습니다."
            case .http(let code): return "병원 정보를 불러오지 못했습니다 (HTTP \(code))."
            case .decoding: return "병원 정보 형식이 변경되었습니다. 잠시 후 다시 시도해 주세요."
            }
        }
    }

    private func request<T: Decodable>(_ route: String, query: [URLQueryItem] = []) async throws -> T {
        var components = URLComponents(url: AppConfig.webURL(route), resolvingAgainstBaseURL: false)!
        components.queryItems = query.isEmpty ? nil : query
        guard let url = components.url, url.scheme == "https", url.host == AppConfig.origin.host else {
            throw Failure.invalidResponse
        }
        var req = URLRequest(url: url)
        req.cachePolicy = .reloadIgnoringLocalCacheData
        req.timeoutInterval = 15
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse else { throw Failure.invalidResponse }
        guard (200...299).contains(http.statusCode) else { throw Failure.http(http.statusCode) }
        do { return try JSONDecoder().decode(T.self, from: data) }
        catch { throw Failure.decoding }
    }

    func search(name: String, region: String, specialty: String) async throws -> [Hospital] {
        var q = [URLQueryItem(name: "limit", value: "80")]
        let text = String(name.prefix(80)).trimmingCharacters(in: .whitespacesAndNewlines)
        if !text.isEmpty { q.append(.init(name: "q", value: text)) }
        if !region.isEmpty && region != "전국" { q.append(.init(name: "region", value: region)) }
        if !specialty.isEmpty { q.append(.init(name: "trade", value: String(specialty.prefix(40)))) }
        let result: CatalogSearchResponse = try await request("/api/public-catalog/search", query: q)
        return result.items
    }

    func near(_ coordinate: CLLocationCoordinate2D) async throws -> [Hospital] {
        let q = [
            URLQueryItem(name: "lat", value: String(coordinate.latitude)),
            URLQueryItem(name: "lon", value: String(coordinate.longitude)),
            URLQueryItem(name: "radius", value: "10"),
            URLQueryItem(name: "limit", value: "80")
            // Deliberately NO include_estimated=1.
        ]
        let result: NearbyResponse = try await request("/api/public-catalog/nearby", query: q)
        return result.items.filter { $0.verifiedCoordinate != nil }
    }

    func item(_ id: Int) async throws -> Hospital {
        guard id > 0 else { throw Failure.invalidResponse }
        return try await request("/api/public-catalog/store/\(id)")
    }

    func stats() async throws -> CatalogStats { try await request("/api/public-catalog/stats") }
}
