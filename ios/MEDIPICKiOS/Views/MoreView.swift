import SwiftUI

struct MoreView: View {
    var body: some View {
        NavigationStack {
            List {
                Section("메디픽 웹 서비스") {
                    Link(destination: AppConfig.webURL("/health-content")) {
                        Label("건강정보 · 영상", systemImage: "doc.text.image")
                    }
                    Link(destination: AppConfig.webURL("/consult")) {
                        Label("의료정보 안내", systemImage: "cross.vial")
                    }
                    Link(destination: AppConfig.webURL("/insurance-claims")) {
                        Label("보험 청구 방법 안내", systemImage: "list.bullet.clipboard")
                    }
                    Link(destination: AppConfig.webURL("/auth/sign-in")) {
                        Label("웹 계정 로그인", systemImage: "person.crop.circle")
                    }
                    Text("외부 웹 서비스는 Safari에서 열립니다. 앱 즐겨찾기와 웹 계정은 별도 관리됩니다.")
                        .font(.caption).foregroundStyle(.secondary)
                }
                Section("안내 및 개인정보") {
                    Label("병원명·주소는 수집된 후보이며 실제 진료·운영을 인증하지 않습니다.", systemImage: "info.circle")
                        .font(.footnote)
                    Label("앱에서 위치 정보는 버튼을 탭한 경우에만 요청합니다.", systemImage: "location.slash")
                        .font(.footnote)
                    Label("즐겨찾기는 기기 Keychain에 병원 번호만 보관합니다.", systemImage: "lock.shield")
                        .font(.footnote)
                    Label("앱이 의료 진단·처방·예약 확정을 제공하지 않습니다.", systemImage: "checkmark.shield")
                        .font(.footnote)
                    Link(destination: AppConfig.origin) { Label("공식 사이트 열기", systemImage: "safari") }
                }
                Section("버전") {
                    Text("메디픽 iOS 베타 1.0 · 네이티브 병원 검색 및 지도")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("더보기")
        }
    }
}
