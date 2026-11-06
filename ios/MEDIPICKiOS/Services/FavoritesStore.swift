import Foundation
import Security

/// Store only opaque public catalog IDs, never diagnoses, queries, or medical records.
@MainActor
final class FavoritesStore: ObservableObject {
    @Published private(set) var ids: Set<Int> = []
    private let service = "site.lexid.medipick.favorites"
    private let account = "catalog-id-list-v1"

    init() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var item: CFTypeRef?
        if SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
           let data = item as? Data,
           let values = try? JSONDecoder().decode([Int].self, from: data) {
            ids = Set(values.filter { $0 > 0 })
        }
    }

    func contains(_ id: Int) -> Bool { ids.contains(id) }

    func toggle(_ id: Int) {
        guard id > 0 else { return }
        var next = ids
        if next.contains(id) { next.remove(id) } else { next.insert(id) }
        persist(next)
    }

    func removeAll() { persist([]) }

    private func persist(_ values: Set<Int>) {
        guard let data = try? JSONEncoder().encode(values.sorted()) else { return }
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        let payload: [String: Any] = [kSecValueData as String: data]
        let status = SecItemUpdate(query as CFDictionary, payload as CFDictionary)
        if status == errSecItemNotFound {
            var created = query
            created[kSecValueData as String] = data
            created[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            if SecItemAdd(created as CFDictionary, nil) == errSecSuccess { ids = values }
        } else if status == errSecSuccess { ids = values }
    }
}
