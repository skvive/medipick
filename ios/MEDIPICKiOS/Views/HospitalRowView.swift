import SwiftUI

struct HospitalRowView: View {
    let hospital: Hospital
    @EnvironmentObject private var favorites: FavoritesStore

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "cross.case.fill")
                .font(.title3)
                .frame(width: 42, height: 42)
                .foregroundStyle(.blue)
                .background(.blue.opacity(0.1), in: RoundedRectangle(cornerRadius: 13))
            VStack(alignment: .leading, spacing: 5) {
                HStack(spacing: 6) {
                    Text(hospital.name).font(.headline).foregroundStyle(.primary)
                    if hospital.isPremium == true { Text("광고").font(.caption2).padding(.horizontal, 5).background(.yellow.opacity(0.3), in: Capsule()) }
                }
                Text(hospital.displayType).font(.caption).foregroundStyle(.secondary)
                Text(hospital.displayAddress).font(.caption).foregroundStyle(.secondary).lineLimit(2)
                Text(hospital.verifiedCoordinate == nil ? "위치 미검증" : "주소 기반 좌표 등록")
                    .font(.caption2).foregroundStyle(hospital.verifiedCoordinate == nil ? .orange : .green)
            }
            Spacer(minLength: 0)
            Image(systemName: favorites.contains(hospital.id) ? "heart.fill" : "heart")
                .foregroundStyle(.pink)
                .padding(9)
                .accessibilityLabel(favorites.contains(hospital.id) ? "즐겨찾기 등록됨" : "상세에서 즐겨찾기 가능")
        }
        .padding(.vertical, 5)
        .contentShape(Rectangle())
    }
}
