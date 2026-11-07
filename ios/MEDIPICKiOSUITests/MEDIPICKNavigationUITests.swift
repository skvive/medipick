import XCTest

/// A real simulator interaction test. It is not a physical iPhone test.
@MainActor
final class MEDIPICKNavigationUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testFourTabsAndSearchInput() throws {
        let app = XCUIApplication()
        app.launch()

        let tabs = app.tabBars.firstMatch
        XCTAssertTrue(tabs.waitForExistence(timeout: 30), "iOS app must display native tabs")
        XCTAssertTrue(app.textFields["병원명 또는 주소"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.buttons["검색"].exists)
        screenshot(app, "01_hospital_search")

        XCTAssertTrue(tabs.buttons["지도"].exists)
        tabs.buttons["지도"].tap()
        XCTAssertTrue(app.staticTexts["검증 좌표만 표시"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.buttons["내 위치에서 확인"].exists)
        screenshot(app, "02_verified_map")

        tabs.buttons["즐겨찾기"].tap()
        XCTAssertTrue(app.navigationBars["즐겨찾기"].waitForExistence(timeout: 15))
        screenshot(app, "03_favorites")

        tabs.buttons["더보기"].tap()
        XCTAssertTrue(app.navigationBars["더보기"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.staticTexts["웹 계정 로그인"].exists)
        screenshot(app, "04_more")

        tabs.buttons["병원 찾기"].tap()
        let query = app.textFields["병원명 또는 주소"]
        XCTAssertTrue(query.waitForExistence(timeout: 15))
        query.tap()
        query.typeText("MEDIPICKUIQA7890\n")
        XCTAssertTrue(app.tabBars.buttons["병원 찾기"].exists)
        screenshot(app, "05_search_submit")
    }

    private func screenshot(_ app: XCUIApplication, _ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
