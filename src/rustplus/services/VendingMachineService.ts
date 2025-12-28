import itemsData from '../resources/items.json';
import * as MapUtils from '../utils/Map';
import { AppMarker } from '../../gen/rustplus_pb';

interface ItemDefinition {
    name: string;
    shortname: string;
}

const items: Record<string, ItemDefinition> = itemsData as any;

export interface VendingSearchResult {
    grid: string | null;
    quantity: number;
    itemName: string;
    cost: number;
    currencyName: string;
    amountInStock: number;
    isBlueprint: boolean;
    location: string | null;
}

export class VendingMachineService {
    private vendingMachines: AppMarker[] = [];

    /**
     * Updates the internal list of vending machines from map markers.
     * @param markers The raw markers array from `getMapMarkers`.
     */
    public updateVendingMachines(markers: AppMarker[]) {
        // Vending Machine type ID is 3 (AppMarkerType.VendingMachine)
        this.vendingMachines = markers.filter(m => m.type === 3);
    }

    /**
     * Search for an item in vending machines.
     * @param query Item name or ID.
     * @param mapSize The size of the map for grid calculation.
     * @param orderType 'buy', 'sell', or 'all'.
     * @returns Object with query info and results.
     */
    public search(query: string, mapSize: number, orderType: 'sell' | 'buy' | 'all' = 'sell') {
        const itemId = this.resolveItemId(query);
        if (!itemId) {
            return { error: `Item '${query}' not found.` };
        }

        const itemName = items[itemId]?.name || itemId;
        const results: VendingSearchResult[] = [];

        for (const vm of this.vendingMachines) {
            if (!vm.sellOrders || vm.sellOrders.length === 0) continue;

            const pos = MapUtils.getPos(vm.x, vm.y, mapSize, null);

            for (const order of vm.sellOrders) {
                if (order.amountInStock === 0) continue; // Skip empty stock

                const isSellMatch = order.itemId.toString() === itemId;
                const isBuyMatch = order.currencyId.toString() === itemId;

                let match = false;
                if (orderType === 'sell' && isSellMatch) match = true;
                if (orderType === 'buy' && isBuyMatch) match = true;
                if (orderType === 'all' && (isSellMatch || isBuyMatch)) match = true;

                if (match) {
                    results.push({
                        grid: pos.location,
                        location: pos.string,
                        quantity: order.quantity,
                        itemName: items[order.itemId.toString()]?.name || order.itemId.toString(),
                        cost: order.costPerItem,
                        currencyName: items[order.currencyId.toString()]?.name || order.currencyId.toString(),
                        amountInStock: order.amountInStock,
                        isBlueprint: order.itemIsBlueprint
                    });
                }
            }
        }

        return {
            queryItem: itemName,
            results: results
        };
    }

    private resolveItemId(query: string): string | null {
        // Direct ID check
        if (items[query]) return query;

        // Name search (case-insensitive, partial match)
        const lowerQuery = query.toLowerCase();
        let bestMatchId: string | null = null;
        let shortestLength = Infinity;

        for (const [id, item] of Object.entries(items)) {
            const lowerName = item.name.toLowerCase();
            if (lowerName === lowerQuery) return id; // Exact match
            if (lowerName.includes(lowerQuery)) {
                if (lowerName.length < shortestLength) {
                    shortestLength = lowerName.length;
                    bestMatchId = id;
                }
            }
        }
        return bestMatchId;
    }
}
