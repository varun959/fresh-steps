enum Constants {
    // ⚠️ Replace with your Railway backend URL before running on device
    static let apiBaseURL = "https://your-app.railway.app"
    static let demoUserId = "be6fa358-058d-4d5b-9b1b-0e5a3cd76d9c"

    // Map defaults — centered on Baar, Switzerland (zoom ~14)
    static let defaultLatitude  = 47.196
    static let defaultLongitude = 8.5307
    static let defaultSpanDegrees = 0.04   // ~4 km across

    // GPS filtering — matches PWA thresholds
    static let maxAccuracyMeters: Double = 150  // ignore coarse/cell-tower fixes
    static let minDistanceBetweenPoints: Double = 10  // metres between recorded coords
}
