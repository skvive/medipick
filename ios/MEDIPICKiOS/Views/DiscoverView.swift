import SwiftUI

struct DiscoverView: View {
    @EnvironmentObject private var catalog: CatalogStore
    private let regions = ["전국", "서울", "경기", "인천", "부산", "대구", "대전", "광주", "울산", "세종", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"]
    private let specialties = ["", "내과", "정형외과", "치과", "피부과", "소아청소년과", "이비인후과", "산부인과"]

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                VStack(alignment: .leading, spacing: 11) {
                    HStack {
                        Image(systemName: "cross.case.fill").foregroundStyle(.blue)
                        Text("내 근처 병원찾기, 메디픽").font(.title3.bold())
                    }
                    Text("병원 주소록 후보를 확인하세요. 입점·진료 추천이나 운영 상태 인증이 아닙니다.")
                        .font(.caption).foregroundStyle(.secondary)
                    HStack {
                        Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
                        TextField("병원명 또는 주소 검색", text: $catalog.query)
                            .submitLabel(.search)
                            .onSubmit { catalog.refresh() }
                            .accessibilityLabel("병원명 또는 주소")
                        if !catalog.query.isEmpty {
                            Button { catalog.query = ""; catalog.refresh() } label: { Image(systemName: "xmark.circle.fill") }
                        }
                    }
                    .padding(12)
                    .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14))
                    HStack {
                        Picker("지역", selection: $catalog.region) {
                            ForEach(regions, id: \.self) { Text($0).tag($0) }
                        }
                        Picker("진료과", selection: $catalog.specialty) {
                            ForEach(specialties, id: \.self) { Text($0.isEmpty ? "진료과 전체" : $0).tag($0) }
                        }
                        Button("검색") { catalog.refresh() }.buttonStyle(.borderedProminent)
                    }
                    .font(.subheadline)
                }
                .padding()
                if catalog.isLoading { ProgressView("주소록 검색 중...").padding() }
                if let error = catalog.failure {
                    ContentUnavailableView("연결 확인 필요", systemImage: "wifi.exclamationmark", description: Text(error))
                    Button("다시 시도") { catalog.refresh() }.buttonStyle(.bordered)
                    Spacer()
                } else if catalog.hospitals.isEmpty && !catalog.isLoading {
                    ContentUnavailableView("검색 결과 없음", systemImage: "cross.case", description: Text("지역·검색어를 변경해 다시 찾아보세요."))
                    Spacer()
                } else {
                    List(catalog.hospitals) { h in
                        NavigationLink { HospitalDetailView(hospital: h) } label: { HospitalRowView(hospital: h) }
                    }
                    .listStyle(.plain)
                    .overlay(alignment: .bottom) {
                        Text("방문 전 의료기관의 주소·전화·운영 여부를 직접 확인하세요.")
                            .font(.caption2).foregroundStyle(.secondary)
                            .padding(8)
                            .background(.regularMaterial, in: Capsule())
                            .padding(.bottom, 6)
                    }
                }
            }
            .navigationTitle("병원 찾기")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button { catalog.refresh() } label: { Image(systemName: "arrow.clockwise") } } }
        }
    }
}
