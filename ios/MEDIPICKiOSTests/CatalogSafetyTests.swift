import XCTest
@testable import MEDIPICKiOS

final class CatalogSafetyTests: XCTestCase {
    private let decoder = JSONDecoder()

    func testApproximatePinNeverExposed() throws {
        let hospital = try decoder.decode(Hospital.self, from: Data(#"{"id":1,"name":"테스트의원","latitude":37.5,"longitude":127.1,"geocode_status":"approx"}"#.utf8))
        XCTAssertNil(hospital.verifiedCoordinate)
    }

    func testExactPinRequiresValidKoreanCoordinate() throws {
        let good = try decoder.decode(Hospital.self, from: Data(#"{"id":2,"name":"테스트의원","latitude":37.5,"longitude":127.1,"geocode_status":"exact"}"#.utf8))
        XCTAssertNotNil(good.verifiedCoordinate)
        let bad = try decoder.decode(Hospital.self, from: Data(#"{"id":3,"name":"테스트의원","latitude":0,"longitude":0,"geocode_status":"exact"}"#.utf8))
        XCTAssertNil(bad.verifiedCoordinate)
    }

    func testMissingAddressIsClearlyDisclosed() throws {
        let item = try decoder.decode(Hospital.self, from: Data(#"{"id":4,"name":"테스트의원"}"#.utf8))
        XCTAssertTrue(item.displayAddress.contains("미확인"))
    }

    func testWebsiteHostIsPinned() {
        let url = AppConfig.webURL("/smart-store")
        XCTAssertEqual(url.scheme, "https")
        XCTAssertEqual(url.host, "medipick.lexid.site")
    }
}
