import SwiftUI
import MapKit

struct MapContainerView: UIViewRepresentable {
    @ObservedObject var mapViewModel: MapViewModel
    @ObservedObject var walkViewModel: WalkViewModel

    func makeUIView(context: Context) -> MKMapView {
        let mapView = MKMapView()
        mapView.delegate = context.coordinator
        mapView.showsUserLocation = true
        mapView.showsCompass = true

        let center = CLLocationCoordinate2D(
            latitude: Constants.defaultLatitude,
            longitude: Constants.defaultLongitude
        )
        let span = MKCoordinateSpan(
            latitudeDelta: Constants.defaultSpanDegrees,
            longitudeDelta: Constants.defaultSpanDegrees
        )
        mapView.setRegion(MKCoordinateRegion(center: center, span: span), animated: false)

        // Pan to user's location once GPS is available
        context.coordinator.startObservingLocation(mapView: mapView)

        return mapView
    }

    func updateUIView(_ mapView: MKMapView, context: Context) {
        let coordinator = context.coordinator

        // Replace road overlays only when the version bumps (new fetch completed)
        if coordinator.lastRoadVersion != mapViewModel.roadOverlayVersion {
            mapView.removeOverlays(coordinator.currentRoadOverlays)
            mapView.addOverlays(mapViewModel.roadOverlays, level: .aboveRoads)
            coordinator.currentRoadOverlays = mapViewModel.roadOverlays
            coordinator.lastRoadVersion = mapViewModel.roadOverlayVersion
        }

        // Rebuild the live walk path whenever the coord count changes
        let coordCount = walkViewModel.coords.count
        if coordinator.lastCoordCount != coordCount {
            if let old = coordinator.livePathOverlay {
                mapView.removeOverlay(old)
                coordinator.livePathOverlay = nil
            }
            if (walkViewModel.state == .tracking || walkViewModel.state == .saving),
               coordCount >= 2 {
                let pathCoords = walkViewModel.coords.map {
                    CLLocationCoordinate2D(latitude: $0[1], longitude: $0[0])
                }
                let path = MKPolyline(coordinates: pathCoords, count: pathCoords.count)
                coordinator.livePathOverlay = path
                mapView.addOverlay(path, level: .aboveLabels)
            }
            coordinator.lastCoordCount = coordCount
        }
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(mapViewModel: mapViewModel)
    }

    // MARK: - Coordinator

    @MainActor
    class Coordinator: NSObject, MKMapViewDelegate {
        var mapViewModel: MapViewModel
        var currentRoadOverlays: [RoadOverlay] = []
        var livePathOverlay: MKPolyline?
        var lastRoadVersion: Int = -1
        var lastCoordCount: Int = -1
        var hasRecenteredOnUser = false
        private var locationObservation: NSKeyValueObservation?

        init(mapViewModel: MapViewModel) {
            self.mapViewModel = mapViewModel
        }

        func startObservingLocation(mapView: MKMapView) {
            locationObservation = LocationManager.shared.observe(
                \.currentLocation, options: [.new]
            ) { [weak self, weak mapView] _, change in
                guard let self, let mapView,
                      let location = change.newValue as? CLLocation,
                      !self.hasRecenteredOnUser else { return }
                self.hasRecenteredOnUser = true
                Task { @MainActor in
                    let region = MKCoordinateRegion(
                        center: location.coordinate,
                        span: MKCoordinateSpan(
                            latitudeDelta: Constants.defaultSpanDegrees,
                            longitudeDelta: Constants.defaultSpanDegrees
                        )
                    )
                    mapView.setRegion(region, animated: true)
                }
            }
        }

        // MARK: MKMapViewDelegate

        func mapView(_ mapView: MKMapView, regionDidChangeAnimated animated: Bool) {
            Task { @MainActor in
                self.mapViewModel.onRegionChanged(mapView.region)
            }
        }

        func mapView(_ mapView: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
            if let road = overlay as? RoadOverlay {
                let r = MKPolylineRenderer(polyline: road)
                r.strokeColor = road.status.color
                r.lineWidth = 2.5
                return r
            }
            if let polyline = overlay as? MKPolyline {
                // Live walk path — orange (#f97316)
                let r = MKPolylineRenderer(polyline: polyline)
                r.strokeColor = UIColor(red: 0.976, green: 0.451, blue: 0.086, alpha: 1)
                r.lineWidth = 4
                return r
            }
            return MKOverlayRenderer(overlay: overlay)
        }
    }
}
