import SwiftUI

@main
struct MEDIPICKApp: App {
    @StateObject private var catalog = CatalogStore()
    @StateObject private var favorites = FavoritesStore()
    @StateObject private var location = LocationService()

    var body: some Scene {
        WindowGroup {
            RootTabView()
                .environmentObject(catalog)
                .environmentObject(favorites)
                .environmentObject(location)
                .tint(Color(red: 0.10, green: 0.40, blue: 0.95))
                .task {
                    catalog.refresh()
                    await catalog.loadStats()
                }
        }
    }
}
