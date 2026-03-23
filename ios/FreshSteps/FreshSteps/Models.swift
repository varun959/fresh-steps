import UIKit

// MARK: - GeoJSON (from /api/roads)

struct GeoJSONFeatureCollection: Decodable {
    let features: [GeoJSONFeature]
}

struct GeoJSONFeature: Decodable {
    let geometry: GeoJSONGeometry
    let properties: RoadProperties
}

struct GeoJSONGeometry: Decodable {
    let type: String
    let coordinates: [[Double]]   // [lng, lat] pairs (PostGIS order)
}

struct RoadProperties: Decodable {
    let id: Int64
    let status: String            // "fresh" | "partial" | "covered"
    let name: String?
    let highway: String?
}

enum RoadStatus: String {
    case fresh, partial, covered

    var color: UIColor {
        switch self {
        case .fresh:   return UIColor(red: 0.086, green: 0.639, blue: 0.290, alpha: 1)  // #16a34a
        case .partial: return UIColor(red: 0.792, green: 0.541, blue: 0.016, alpha: 1)  // #ca8a04
        case .covered: return UIColor(red: 0.420, green: 0.447, blue: 0.498, alpha: 1)  // #6b7280
        }
    }
}

// MARK: - Walk API

struct SaveWalkRequest: Encodable {
    let userId: String
    let coordinates: [[Double]]  // [lng, lat] pairs
    let startedAt: String        // ISO 8601
    let completedAt: String      // ISO 8601
}

struct WalkSummary: Decodable {
    let walkId: String
    let distanceMeters: Double
    let durationSeconds: Int
    let coveredWayCount: Int
}
