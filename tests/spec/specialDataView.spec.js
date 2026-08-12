import { weatherProviderModel } from '../../js/models/weatherProviderModel.js/index.js';
import { uiStateModel } from '../../js/models/uiStateModel.js';

describe('special data view', () => {
    let specialDataView;
    let layerGroup;
    let marker;
    let map;
    let originalL;

    function createLeafletMock() {
        layerGroup = {
            addLayer: jasmine.createSpy('addLayer'),
            removeLayer: jasmine.createSpy('removeLayer')
        };

        marker = {
            on: jasmine.createSpy('on'),
            setIcon: jasmine.createSpy('setIcon'),
            setLatLng: jasmine.createSpy('setLatLng')
        };

        return {
            divIcon: jasmine.createSpy('divIcon').and.callFake((options) => options),
            layerGroup: jasmine.createSpy('layerGroup').and.returnValue({
                addTo: jasmine.createSpy('addTo').and.returnValue(layerGroup)
            }),
            marker: jasmine.createSpy('marker').and.returnValue(marker),
            latLng: jasmine.createSpy('latLng').and.callFake((lat, lng) => ({ lat, lng })),
            DomEvent: {
                on: jasmine.createSpy('on'),
                stopPropagation: jasmine.createSpy('stopPropagation'),
                preventDefault: jasmine.createSpy('preventDefault')
            }
        };
    }

    function createMap(contains = true) {
        return {
            getZoom: jasmine.createSpy('getZoom').and.returnValue(8),
            getBounds: jasmine.createSpy('getBounds').and.returnValue({
                contains: jasmine.createSpy('contains').and.returnValue(contains)
            }),
            on: jasmine.createSpy('on')
        };
    }

    beforeAll(async () => {
        originalL = window.L;
        window.L = createLeafletMock();
        ({ specialDataView } = await import('../../js/views/specialDataView.js?spec=' + Date.now()));
    });

    beforeEach(() => {
        layerGroup.addLayer.calls.reset();
        layerGroup.removeLayer.calls.reset();
        marker.on.calls.reset();
        marker.setIcon.calls.reset();
        marker.setLatLng.calls.reset();
        window.L.divIcon.calls.reset();
        window.L.layerGroup.calls.reset();
        window.L.marker.calls.reset();
        map = createMap(true);
        weatherProviderModel.setSpecialDataSummary('4/10/12%');
        uiStateModel.setShowWindMeasurements(true);
    });

    afterAll(() => {
        weatherProviderModel.setSpecialDataSummary(null);
        uiStateModel.setShowWindMeasurements(true);
        window.L = originalL;
    });

    it('should hide the badge when wind measurements are hidden and keep map bounds as the gate', () => {
        specialDataView.init(map);

        expect(window.L.marker).toHaveBeenCalledTimes(1);

        uiStateModel.setShowWindMeasurements(false);

        expect(layerGroup.removeLayer).toHaveBeenCalledWith(marker);
        expect(weatherProviderModel.specialDataSummary).toBe('4/10/12%');

        map.getBounds.and.returnValue({
            contains: jasmine.createSpy('contains').and.returnValue(false)
        });
        uiStateModel.setShowWindMeasurements(true);
        specialDataView.refresh();

        expect(window.L.marker).toHaveBeenCalledTimes(1);
    });
});
