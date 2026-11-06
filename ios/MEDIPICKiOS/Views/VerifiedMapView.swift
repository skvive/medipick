import SwiftUI
import MapKit
import CoreLocation

struct VerifiedMapView: View {
    @EnvironmentObject private var catalog: CatalogStore
    @EnvironmentObject private var location: LocationService
    @State private var camera: MapCameraPosition = .region(MKCoordinateRegion(
        center: CLLocationCoordinate2D(latitude: AppConfig.cityCenterLatitude, longitude: AppConfig.cityCenterLongitude),
        span: MKCoordinateSpan(latitudeDelta: 0.35, longitudeDelta: 0.35)
    ))
    @State private var selectedID: Int?
    @State private var selectedHospital: Hospital?

    private var verified: [Hospital] { catalog.hospitals.filter { $0.verifiedCoordinate != nil } }

    var body: some View {
        NavigationStack {
            ZStack(alignment: .top) {
                Map(position: $camera, selection: $selectedID) {
                    ForEach(verified) { hospital in
                        if let point = hospital.verifiedCoordinate {
                            Marker(hospital.name, coordinate: point).tag(hospital.id)
                        }
                    }
                    if let point = location.coordinate {
                        Annotation("내 위치", coordinate: point) {
                            Image(systemName: "location.circle.fill")
                                .font(.title2).foregroundStyle(.blue)
                                .background(.white, in: Circle())
                        }
                    }
                }
                .mapControls { MapCompass(); MapScaleView() }
                VStack(spacing: 8) {
                    Label("검증 좌표만 표시", systemImage: "checkmark.shield.fill")
                        .font(.caption.bold())
                    Text("현재 주소록의 추정 좌표는 지도에 표시하지 않습니다.")
                        .font(.caption2)
                    if verified.isEmpty {
                        Text("아직 이 검색 결과에는 정확도 검증된 병원 핀이 없습니다.")
                            .font(.footnote).multilineTextAlignment(.center)
                    }
                    Button {
                        location.requestOnTap()
                    } label: { Label("내 위치에서 확인", systemImage: "location.fill") }
                        .buttonStyle(.borderedProminent)
                    if let warning = location.message {
                        Text(warning).font(.caption2).foregroundStyle(.orange)
                    }
                }
                .padding(14)
                .frame(maxWidth: 340)
                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 18))
                .padding(.top, 14)
            }
            .navigationTitle("검증된 병원 지도")
            .navigationBarTitleDisplayMode(.inline)
            .onChange(of: selectedID) { _, newID in
                if let id = newID { selectedHospital = verified.first { $0.id == id } }
            }
            .onChange(of: location.coordinate?.latitude) { _, _ in
                guard let coord = location.coordinate else { return }
                camera = .region(MKCoordinateRegion(center: coord, span: MKCoordinateSpan(latitudeDelta: 0.10, longitudeDelta: 0.10)))
                Task { await catalog.searchNear(coord) }
            }
            .sheet(item: $selectedHospital) { hospital in
                NavigationStack {
                    HospitalDetailView(hospital: hospital)
                        .toolbar {
                            ToolbarItem(placement: .topBarTrailing) {
                                Button("닫기") { selectedHospital = nil }
                            }
                        }
                }
            }
        }
    }
}
