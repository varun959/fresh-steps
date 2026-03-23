import Foundation

enum APIError: LocalizedError {
    case badURL
    case serverError(Int)
    case decodingError(Error)

    var errorDescription: String? {
        switch self {
        case .badURL:             return "Invalid API URL"
        case .serverError(let c): return "Server error \(c)"
        case .decodingError(let e): return "Decode error: \(e.localizedDescription)"
        }
    }
}

class APIClient {
    static let shared = APIClient()

    private let baseURL: String
    private let decoder: JSONDecoder

    private init() {
        baseURL = Constants.apiBaseURL
        decoder = JSONDecoder()
    }

    // GET /api/roads?bbox=minLon,minLat,maxLon,maxLat&userId=
    func fetchRoads(bbox: String, userId: String) async throws -> GeoJSONFeatureCollection {
        guard let url = URL(string: "\(baseURL)/api/roads?bbox=\(bbox)&userId=\(userId)") else {
            throw APIError.badURL
        }
        let (data, response) = try await URLSession.shared.data(from: url)
        try validate(response)
        do {
            return try decoder.decode(GeoJSONFeatureCollection.self, from: data)
        } catch {
            throw APIError.decodingError(error)
        }
    }

    // POST /api/walks
    func saveWalk(_ request: SaveWalkRequest) async throws -> WalkSummary {
        guard let url = URL(string: "\(baseURL)/api/walks") else { throw APIError.badURL }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(request)
        let (data, response) = try await URLSession.shared.data(for: req)
        try validate(response)
        do {
            return try decoder.decode(WalkSummary.self, from: data)
        } catch {
            throw APIError.decodingError(error)
        }
    }

    // DELETE /api/walks/:id
    func deleteWalk(id: String) async throws {
        guard let url = URL(string: "\(baseURL)/api/walks/\(id)") else { throw APIError.badURL }
        var req = URLRequest(url: url)
        req.httpMethod = "DELETE"
        _ = try await URLSession.shared.data(for: req)
    }

    private func validate(_ response: URLResponse) throws {
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let code = (response as? HTTPURLResponse)?.statusCode ?? 0
            throw APIError.serverError(code)
        }
    }
}
