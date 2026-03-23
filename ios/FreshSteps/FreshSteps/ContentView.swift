import SwiftUI

struct ContentView: View {
    @StateObject private var mapViewModel  = MapViewModel()
    @StateObject private var walkViewModel = WalkViewModel()
    @ObservedObject private var location   = LocationManager.shared

    var body: some View {
        ZStack {
            MapContainerView(mapViewModel: mapViewModel, walkViewModel: walkViewModel)
                .ignoresSafeArea()

            WalkTrackerView(viewModel: walkViewModel)

            // Prompt if location permission hasn't been asked yet
            if location.authorizationStatus == .notDetermined {
                VStack {
                    Spacer()
                    Button("Enable Location Access") {
                        location.requestPermission()
                    }
                    .buttonStyle(.borderedProminent)
                    .padding(.bottom, 120)
                }
            }

            // Denied banner
            if location.authorizationStatus == .denied ||
               location.authorizationStatus == .restricted {
                VStack {
                    HStack {
                        Image(systemName: "location.slash")
                        Text("Location access denied — enable in Settings")
                            .font(.caption)
                    }
                    .padding(10)
                    .background(Color.red.opacity(0.9))
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .padding(.top, 60)
                    Spacer()
                }
            }
        }
        .onAppear {
            if location.authorizationStatus == .notDetermined {
                location.requestPermission()
            }
        }
    }
}
