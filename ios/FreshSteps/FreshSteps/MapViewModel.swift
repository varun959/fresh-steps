import MapKit
import Combine

/// A RoadOverlay carries the coverage status so the map delegate can colour it correctly.
final class RoadOverlay: MKPolyline {
    var status: RoadStatus = .fresh
}

@MainActor
class MapViewModel: ObservableObject {
    @Published private(set) var roadOverlays: [RoadOverlay] = []
    /// Bumped each time roadOverlays is replaced — lets MapContainerView skip redundant updates.
    @Published private(set) var roadOverlayVersion: Int = 0

    private var fetchTask: Task<Void, Never>?
    private var debounceTimer: Timer?

    /// Called by MapCoordinator whenever the visible region changes.
    func onRegionChanged(_ region: MKCoordinateRegion) {
        // Skip if too zoomed out — latitudeDelta > 0.15° ≈ zoom < 13 (~17 km span)
        guard region.span.latitudeDelta < 0.15 else { return }

        debounceTimer?.invalidate()
        debounceTimer = Timer.scheduledTimer(withTimeInterval: 0.3, repeats: false) { [weak self] _ in
            guard let self else { return }
            Task { await self.fetchRoads(bbox: self.bbox(for: region)) }
        }
    }

    private func fetchRoads(bbox: String) async {
        fetchTask?.cancel()
        fetchTask = Task {
            do {
                let collection = try await APIClient.shared.fetchRoads(
                    bbox: bbox,
                    userId: Constants.demoUserId
                )
                guard !Task.isCancelled else { return }

                let overlays: [RoadOverlay] = collection.features.compactMap { feature in
                    guard feature.geometry.type == "LineString",
                          feature.geometry.coordinates.count >= 2 else { return nil }
                    let coords = feature.geometry.coordinates.map {
                        CLLocationCoordinate2D(latitude: $0[1], longitude: $0[0])
                    }
                    let overlay = RoadOverlay(coordinates: coords, count: coords.count)
                    overlay.status = RoadStatus(rawValue: feature.properties.status) ?? .fresh
                    return overlay
                }

                self.roadOverlays = overlays
                self.roadOverlayVersion += 1
            } catch {
                // Silently ignore — stale overlay stays visible
            }
        }
    }

    private func bbox(for region: MKCoordinateRegion) -> String {
        let minLon = region.center.longitude - region.span.longitudeDelta / 2
        let maxLon = region.center.longitude + region.span.longitudeDelta / 2
        let minLat = region.center.latitude  - region.span.latitudeDelta  / 2
        let maxLat = region.center.latitude  + region.span.latitudeDelta  / 2
        return "\(minLon),\(minLat),\(maxLon),\(maxLat)"
    }
}
