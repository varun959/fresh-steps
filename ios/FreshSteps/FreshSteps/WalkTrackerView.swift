import SwiftUI

struct WalkTrackerView: View {
    @ObservedObject var viewModel: WalkViewModel
    @State private var showSummary = false

    var body: some View {
        VStack {
            Spacer()
            HStack(alignment: .bottom) {
                Group {
                    switch viewModel.state {
                    case .idle:    idleButton
                    case .tracking: trackingPanel
                    case .saving:  savingIndicator
                    case .done:    EmptyView()
                    }
                }
                Spacer()
            }
            .padding(.leading, 16)
            .padding(.bottom, 32)
        }
        .sheet(isPresented: $showSummary) {
            WalkSummarySheet(viewModel: viewModel)
        }
        .onChange(of: viewModel.state) { _, newState in
            if newState == .done { showSummary = true }
        }
    }

    // MARK: - Sub-views

    private var idleButton: some View {
        Button(action: { viewModel.startTracking() }) {
            Label("Start Walk", systemImage: "figure.walk")
                .font(.headline)
                .foregroundStyle(.white)
                .padding(.horizontal, 20)
                .padding(.vertical, 14)
                .background(Color.green)
                .clipShape(Capsule())
                .shadow(color: .black.opacity(0.2), radius: 4, y: 2)
        }
    }

    private var trackingPanel: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Stats row
            HStack(spacing: 20) {
                stat(label: "Time", value: formatDuration(viewModel.elapsedSeconds))
                Divider().frame(height: 40)
                stat(label: "Distance", value: String(format: "%.2f km", viewModel.distanceKm))
                Divider().frame(height: 40)
                stat(label: "Points", value: "\(viewModel.coords.count)")
            }

            if let error = viewModel.errorMessage {
                Text(error).font(.caption).foregroundStyle(.red)
            }

            Button(action: { viewModel.stopTracking() }) {
                Label("Stop & Save", systemImage: "stop.circle.fill")
                    .font(.headline)
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(Color.red)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }
        }
        .padding(16)
        .background(.regularMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .shadow(color: .black.opacity(0.15), radius: 6, y: 3)
        .frame(maxWidth: 260)
    }

    private var savingIndicator: some View {
        HStack(spacing: 10) {
            ProgressView()
            Text("Saving…").font(.headline)
        }
        .padding(16)
        .background(.regularMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .shadow(color: .black.opacity(0.15), radius: 6, y: 3)
    }

    private func stat(label: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value).font(.title3.monospacedDigit().bold())
            Text(label).font(.caption).foregroundStyle(.secondary)
        }
    }

    private func formatDuration(_ seconds: Int) -> String {
        let h = seconds / 3600
        let m = (seconds % 3600) / 60
        let s = seconds % 60
        if h > 0 { return String(format: "%d:%02d:%02d", h, m, s) }
        return String(format: "%d:%02d", m, s)
    }
}

// MARK: - Summary sheet

struct WalkSummarySheet: View {
    @ObservedObject var viewModel: WalkViewModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            VStack(spacing: 28) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 64))
                    .foregroundStyle(.green)

                Text("Walk Complete!")
                    .font(.title.bold())

                if let summary = viewModel.summary {
                    Grid(alignment: .leading, horizontalSpacing: 32, verticalSpacing: 20) {
                        GridRow {
                            statCell("Distance",
                                     String(format: "%.2f km", summary.distanceMeters / 1000))
                            statCell("Duration",
                                     formatDuration(summary.durationSeconds))
                        }
                        GridRow {
                            statCell("New streets", "\(summary.coveredWayCount)")
                            Color.clear
                        }
                    }
                    .padding()
                    .background(Color(.secondarySystemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }

                Spacer()

                VStack(spacing: 12) {
                    Button("Done") {
                        viewModel.dismissSummary()
                        dismiss()
                    }
                    .buttonStyle(PrimaryButtonStyle(color: .green))

                    Button("Discard Walk") {
                        viewModel.discardWalk()
                        dismiss()
                    }
                    .font(.subheadline)
                    .foregroundStyle(.red)
                }
            }
            .padding(24)
            .navigationTitle("Walk Summary")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private func statCell(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value).font(.title3.bold())
            Text(label).font(.caption).foregroundStyle(.secondary)
        }
    }

    private func formatDuration(_ seconds: Int) -> String {
        let h = seconds / 3600
        let m = (seconds % 3600) / 60
        if h > 0 { return String(format: "%dh %dm", h, m) }
        return String(format: "%dm %ds", m, seconds % 60)
    }
}

struct PrimaryButtonStyle: ButtonStyle {
    let color: Color
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(color.opacity(configuration.isPressed ? 0.8 : 1))
            .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}
