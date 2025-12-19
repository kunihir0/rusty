// This is a placeholder for item recycling data.
// In a real implementation, this would be a comprehensive map.
// Format: { "itemId": { "resourceId": quantity, ... } }

export const RECYCLING_RESOURCES: Record<string, Record<string, number>> = {
    // Example: Jackhammer
    "1540964143": {
        "metal.fragments": 25,
        "metal.pipe": 1
    },
    // Example: Python Revolver
    "-1850571325": {
        "metal.fragments": 150,
        "metal.pipe": 1,
        "metal.spring": 1
    }
};

export const RESOURCE_NAMES: Record<string, string> = {
    "metal.fragments": "Metal Fragments",
    "metal.pipe": "Metal Pipe",
    "metal.spring": "Metal Spring",
    "wood": "Wood",
    "stones": "Stones"
};
