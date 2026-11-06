import Foundation
import CoreLocation

@MainActor
final class CatalogStore: ObservableObject {
    @Published var query = ""
    @Published var region = "서울"
    @Published var specialty = ""
    @Published private(set) var hospitals: [Hospital] = []
    @Published private(set) var isLoading = false
    @Published private(set) var failure: String?
    @Published private(set) var stats: CatalogStats?

    private let api = CatalogAPI()
    private var task: Task<Void, Never>?

    func refresh() {
        task?.cancel()
        let q = query, r = region, s = specialty
        isLoading = true
        failure = nil
        task = Task {
            do {
                let items = try await api.search(name: q, region: r, specialty: s)
                try Task.checkCancellation()
                hospitals = items
                failure = nil
            } catch is CancellationError {
                return
            } catch {
                failure = error.localizedDescription
            }
            isLoading = false
        }
    }

    func loadStats() async {
        stats = try? await api.stats()
    }

    func searchNear(_ coordinate: CLLocationCoordinate2D) async {
        task?.cancel()
        isLoading = true
        failure = nil
        do {
            hospitals = try await api.near(coordinate)
        } catch {
            failure = error.localizedDescription
        }
        isLoading = false
    }
}
