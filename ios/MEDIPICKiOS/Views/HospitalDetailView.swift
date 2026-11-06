import SwiftUI
import MapKit

struct HospitalDetailView: View {
    let hospital: Hospital
    @EnvironmentObject private var favorites: FavoritesStore

    private var dialURL: URL? {
        let digits = (hospital.phone ?? "").filter { $0.isNumber || $0 == "+" }
        return digits.isEmpty ? nil : URL(string: "tel:\(digits)")
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 8) {
                    Text(hospital.name).font(.largeTitle.bold())
                    Text(hospital.displayType).foregroundStyle(.secondary)
                    if hospital.isPremium == true {
                        Label("유료 구독 노출 · 진료 추천 아님", systemImage: "megaphone")
                            .font(.caption).foregroundStyle(.orange)
                    }
                }
                Divider()
                Label(hospital.displayAddress, systemImage: "mappin.and.ellipse")
                if let phone = hospital.phone, !phone.isEmpty {
                    Label(phone, systemImage: "phone")
                }
                if let summary = hospital.summary, !summary.isEmpty {
                    Text(summary).font(.subheadline).foregroundStyle(.secondary)
                }
                VStack(alignment: .leading, spacing: 8) {
                    Label(hospital.verifiedCoordinate == nil ? "정확한 위치 미검증" : "주소 기준 좌표 등록", systemImage: "exclamationmark.shield")
                        .font(.headline)
                    Text("이 정보는 수집된 주소록 후보입니다. 의료기관 인증·현재 진료 여부·의료진 진료 결과를 보장하지 않습니다.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                .padding()
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(.orange.opacity(0.09), in: RoundedRectangle(cornerRadius: 14))
                HStack(spacing: 12) {
                    Button {
                        favorites.toggle(hospital.id)
                    } label: {
                        Label(favorites.contains(hospital.id) ? "저장 해제" : "즐겨찾기", systemImage: favorites.contains(hospital.id) ? "heart.fill" : "heart")
                    }
                    .buttonStyle(.bordered)
                    if let url = dialURL {
                        Link(destination: url) { Label("전화", systemImage: "phone.fill") }.buttonStyle(.borderedProminent)
                    }
                }
                if let point = hospital.verifiedCoordinate {
                    Button {
                        let placemark = MKPlacemark(coordinate: point)
                        MKMapItem(placemark: placemark).openInMaps(launchOptions: [MKLaunchOptionsDirectionsModeKey: MKLaunchOptionsDirectionsModeDriving])
                    } label: { Label("Apple 지도 길찾기", systemImage: "map") }
                    .buttonStyle(.borderedProminent)
                } else {
                    Text("위치가 확인되기 전에는 길찾기를 제공하지 않습니다.")
                        .font(.caption).foregroundStyle(.secondary)
                }
                ShareLink(item: "\(hospital.name) · \(hospital.displayAddress)") {
                    Label("병원 주소 공유", systemImage: "square.and.arrow.up")
                }
                .buttonStyle(.bordered)
            }
            .padding()
        }
        .navigationTitle("병원 정보")
        .navigationBarTitleDisplayMode(.inline)
    }
}
