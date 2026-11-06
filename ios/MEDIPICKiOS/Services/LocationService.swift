import Foundation
import CoreLocation

@MainActor
final class LocationService: NSObject, ObservableObject, CLLocationManagerDelegate {
    @Published private(set) var coordinate: CLLocationCoordinate2D?
    @Published private(set) var status: CLAuthorizationStatus = .notDetermined
    @Published private(set) var message: String?
    private let manager = CLLocationManager()

    override init() {
        super.init()
        manager.delegate = self
        status = manager.authorizationStatus
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
    }

    func requestOnTap() {
        switch manager.authorizationStatus {
        case .notDetermined: manager.requestWhenInUseAuthorization()
        case .authorizedAlways, .authorizedWhenInUse: manager.requestLocation()
        case .denied, .restricted:
            message = "위치 권한이 꺼져 있습니다. 설정에서 허용하거나 지역 검색을 이용하세요."
        @unknown default: message = "위치 권한 상태를 확인할 수 없습니다."
        }
    }

    // CLLocationManagerDelegate requirements are nonisolated under Swift 6.
    // Cross the actor boundary using only Sendable values; update @Published state on MainActor.
    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let authorization = manager.authorizationStatus
        Task { @MainActor [weak self] in
            guard let self else { return }
            self.status = authorization
            if authorization == .authorizedAlways || authorization == .authorizedWhenInUse {
                self.manager.requestLocation()
            }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last, location.horizontalAccuracy >= 0 else { return }
        let latitude = location.coordinate.latitude
        let longitude = location.coordinate.longitude
        Task { @MainActor [weak self] in
            self?.coordinate = CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
            self?.message = nil
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor [weak self] in
            self?.message = "위치를 확인하지 못했습니다. 지역 검색을 이용해 주세요."
        }
    }
}
