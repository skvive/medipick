import SwiftUI

struct RootTabView: View {
    var body: some View {
        TabView {
            DiscoverView()
                .tabItem { Label("병원 찾기", systemImage: "cross.case.fill") }
            VerifiedMapView()
                .tabItem { Label("지도", systemImage: "map.fill") }
            FavoritesView()
                .tabItem { Label("즐겨찾기", systemImage: "heart.fill") }
            MoreView()
                .tabItem { Label("더보기", systemImage: "square.grid.2x2.fill") }
        }
    }
}
