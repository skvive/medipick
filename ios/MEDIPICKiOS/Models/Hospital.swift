import Foundation
import CoreLocation

struct Hospital: Identifiable, Decodable, Hashable {
    let id: Int
    let name: String
    let phone: String?
    let address: String?
    let region: String?
    let district: String?
    let summary: String?
    let latitude: Double?
    let longitude: Double?
    let geocodeStatus: String?
    let tradeCategory: String?
    let isPremium: Bool?

    enum CodingKeys: String, CodingKey {
        case id, name, phone, address, region, district, summary, latitude, longitude
        case geocodeStatus = "geocode_status"
        case tradeCategory = "trade_category"
        case isPremium = "is_premium"
    }

    static func == (lhs: Hospital, rhs: Hospital) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    /// No 'approx' points are ever promoted or displayed as verified hospital pins.
    var verifiedCoordinate: CLLocationCoordinate2D? {
        guard geocodeStatus == "exact", let lat = latitude, let lon = longitude,
              lat.isFinite, lon.isFinite, (33.0...39.5).contains(lat),
              (124.0...132.0).contains(lon) else { return nil }
        return CLLocationCoordinate2D(latitude: lat, longitude: lon)
    }

    var displayAddress: String {
        let value = (address ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return value.isEmpty ? "주소 미확인 · 방문 전 확인 필요" : value
    }
    var displayType: String { (tradeCategory?.isEmpty == false) ? tradeCategory! : "의료기관 주소록" }
}

struct CatalogSearchResponse: Decodable {
    let items: [Hospital]
    let count: Int?
}

struct NearbyResponse: Decodable {
    let items: [Hospital]
    let count: Int?
}

struct CatalogStats: Decodable {
    let total: Int?
    let exactMappable: Int?
    let estimatedMappable: Int?
    let notice: String?

    enum CodingKeys: String, CodingKey {
        case total, notice
        case exactMappable = "exact_mappable"
        case estimatedMappable = "estimated_mappable"
    }
}
