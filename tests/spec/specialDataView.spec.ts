import { weatherProviderModel } from '../../src/models/weatherProviderModel';
import { uiStateModel } from '../../src/models/uiStateModel';
import { commonDataModel } from '../../src/models/commonDataModel';

describe('special data view', () => {
    let specialDataView;
    let layerGroup;
    let marker;
    let map;
    let originalL;

    function createLeafletMock() {
        layerGroup = {
            addLayer: vi.fn(),
            removeLayer: vi.fn()
        };

        marker = {
            on: vi.fn(),
            setIcon: vi.fn(),
            setLatLng: vi.fn()
        };

        return {
            divIcon: vi.fn().mockImplementation((options) => options),
            layerGroup: vi.fn().mockReturnValue({
                addTo: vi.fn().mockReturnValue(layerGroup)
            }),
            marker: vi.fn().mockReturnValue(marker),
            latLng: vi.fn().mockImplementation((lat, lng) => ({ lat, lng })),
            DomEvent: {
                on: vi.fn(),
                stopPropagation: vi.fn(),
                preventDefault: vi.fn()
            }
        };
    }

    function createMap(contains = true) {
        return {
            getZoom: vi.fn().mockReturnValue(8),
            getBounds: vi.fn().mockReturnValue({
                contains: vi.fn().mockReturnValue(contains)
            }),
            on: vi.fn(),
            addLayer: vi.fn()
        };
    }

    beforeAll(async () => {
        originalL = window.L;
        window.L = createLeafletMock();
        ({ specialDataView } = await import('../../src/views/specialDataView?spec=' + Date.now()));
    });

    beforeEach(() => {
        layerGroup.addLayer.mockClear();
        layerGroup.removeLayer.mockClear();
        marker.on.mockClear();
        marker.setIcon.mockClear();
        marker.setLatLng.mockClear();
        if (window.L && window.L.divIcon && typeof window.L.divIcon.mockClear === 'function') window.L.divIcon.mockClear();
        if (window.L && window.L.layerGroup && typeof window.L.layerGroup.mockClear === 'function') window.L.layerGroup.mockClear();
        if (window.L && window.L.marker && typeof window.L.marker.mockClear === 'function') window.L.marker.mockClear();
        map = createMap(true);
        commonDataModel.setSpecialDataSummary('4/10/12%');
        uiStateModel.setShowWindMeasurements(true);
    });

    afterAll(() => {
        commonDataModel.setSpecialDataSummary(null);
        uiStateModel.setShowWindMeasurements(true);
        window.L = originalL;
    });

    it('should not throw when toggling visibility and refreshing', () => {
        specialDataView.init(map);

        expect(commonDataModel.specialDataSummary).toBe('4/10/12%');

        uiStateModel.setShowWindMeasurements(false);
        expect(() => specialDataView.refresh()).not.toThrow();

        map.getBounds.mockReturnValue({ contains: vi.fn().mockReturnValue(false) });
        uiStateModel.setShowWindMeasurements(true);
        expect(() => specialDataView.refresh()).not.toThrow();
    });
});
