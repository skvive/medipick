import SwiftUI

struct FavoritesView: View {
    @EnvironmentObject private var favorites: FavoritesStore
    @State private var items: [Hospital] = []
    @State private var isLoading = false

    var body: some View {
        NavigationStack {
            Group {
                if isLoading { ProgressView("즐겨찾기 확인 중").frame(maxWidth: .infinity, maxHeight: .infinity) }
                else if items.isEmpty {
                    ContentUnavailableView("저장한 병원이 없습니다", systemImage: "heart", description: Text("병원 찾기에서 관심 병원을 저장해 보세요. 병원 정보는 저장한 뒤에도 다시 확인합니다."))
                } else {
                    List(items) { hospital in
                        NavigationLink { HospitalDetailView(hospital: hospital) } label: { HospitalRowView(hospital: hospital) }
                    }.listStyle(.plain)
                }
            }
            .navigationTitle("즐겨찾기")
            .toolbar {
                if !favorites.ids.isEmpty {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("모두 삭제", role: .destructive) { favorites.removeAll(); items = [] }
                            .font(.caption)
                    }
                }
            }
            .task(id: favorites.ids) { await load() }
        }
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        var result: [Hospital] = []
        let api = CatalogAPI()
        for id in favorites.ids.sorted() {
            if Task.isCancelled { return }
            if let item = try? await api.item(id) { result.append(item) }
        }
        items = result
    }
}
