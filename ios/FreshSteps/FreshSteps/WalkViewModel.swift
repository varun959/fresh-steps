import CoreLocation
import Combine

enum WalkState { case idle, tracking, saving, done }

@MainActor
class WalkViewModel: ObservableObject {
    @Published private(set) var state: WalkState = .idle
    @Published private(set) var coords: [[Double]] = []   // [lng, lat] pairs
    @Published private(set) var elapsedSeconds: Int = 0
    @Published var errorMessage: String?
    @Published private(set) var summary: WalkSummary?

    private var startedAt: Date?
    private var lastLocation: CLLocation?
    private var timerCancellable: AnyCancellable?
    private var locationCancellable: AnyCancellable?

    private let storageKey = "freshSteps.walkInProgress"

    init() { restoreInProgressWalk() }

    // MARK: - Public API

    func startTracking() {
        coords = []
        elapsedSeconds = 0
        errorMessage = nil
        summary = nil
        startedAt = Date()
        lastLocation = nil
        state = .tracking

        LocationManager.shared.startTracking()
        beginTimer(from: Date())
        subscribeToLocation()
    }

    func stopTracking() {
        guard state == .tracking else { return }

        timerCancellable?.cancel()
        locationCancellable?.cancel()
        LocationManager.shared.stopTracking()

        guard coords.count >= 2 else {
            errorMessage = "Walk too short — need at least 2 GPS points"
            state = .idle
            return
        }

        state = .saving
        clearPersistedWalk()

        let isoFormatter = ISO8601DateFormatter()
        let request = SaveWalkRequest(
            userId: Constants.demoUserId,
            coordinates: coords,
            startedAt: isoFormatter.string(from: startedAt ?? Date()),
            completedAt: isoFormatter.string(from: Date())
        )

        Task {
            do {
                let result = try await APIClient.shared.saveWalk(request)
                self.summary = result
                self.state = .done
            } catch {
                self.errorMessage = "Failed to save: \(error.localizedDescription)"
                self.state = .tracking   // allow retry
            }
        }
    }

    func discardWalk() {
        let id = summary?.walkId
        dismissSummary()
        guard let id else { return }
        Task { try? await APIClient.shared.deleteWalk(id: id) }
    }

    func dismissSummary() {
        summary = nil
        errorMessage = nil
        coords = []
        elapsedSeconds = 0
        startedAt = nil
        lastLocation = nil
        state = .idle
    }

    var distanceKm: Double {
        guard coords.count >= 2 else { return 0 }
        var total = 0.0
        for i in 1..<coords.count {
            let a = CLLocation(latitude: coords[i-1][1], longitude: coords[i-1][0])
            let b = CLLocation(latitude: coords[i][1],   longitude: coords[i][0])
            total += b.distance(from: a)
        }
        return total / 1000
    }

    // MARK: - Private helpers

    private func subscribeToLocation() {
        locationCancellable = LocationManager.shared.$currentLocation
            .compactMap { $0 }
            .sink { [weak self] location in self?.handleLocation(location) }
    }

    private func handleLocation(_ location: CLLocation) {
        if let last = lastLocation {
            guard location.distance(from: last) >= Constants.minDistanceBetweenPoints else { return }
        }
        lastLocation = location
        coords.append([location.coordinate.longitude, location.coordinate.latitude])
        persistCoords()
    }

    private func beginTimer(from start: Date) {
        timerCancellable = Timer.publish(every: 1, on: .main, in: .common)
            .autoconnect()
            .sink { [weak self] _ in
                self?.elapsedSeconds = Int(Date().timeIntervalSince(start))
            }
    }

    // MARK: - Crash recovery (UserDefaults, mirrors web localStorage)

    private func persistCoords() {
        guard let start = startedAt else { return }
        let payload: [String: Any] = [
            "coords": coords,
            "startedAt": ISO8601DateFormatter().string(from: start)
        ]
        UserDefaults.standard.set(payload, forKey: storageKey)
    }

    private func clearPersistedWalk() {
        UserDefaults.standard.removeObject(forKey: storageKey)
    }

    private func restoreInProgressWalk() {
        guard let payload = UserDefaults.standard.dictionary(forKey: storageKey),
              let rawCoords = payload["coords"] as? [[Double]],
              let startedAtStr = payload["startedAt"] as? String,
              let start = ISO8601DateFormatter().date(from: startedAtStr),
              rawCoords.count >= 2 else { return }

        coords = rawCoords
        startedAt = start
        if let last = rawCoords.last {
            lastLocation = CLLocation(latitude: last[1], longitude: last[0])
        }
        state = .tracking
        beginTimer(from: start)
        LocationManager.shared.startTracking()
        subscribeToLocation()
    }
}
