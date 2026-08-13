import { updateStationsOnMapAction } from '../../src/controllers/updateStationsOnMapAction';
import { commonDataModel } from '../../src/models/commonDataModel';
import * as measurementsService from '../../src/services/measurementsService';

describe('stations loading and mapping', () => {
  it('loads stations.json and sets visibleStations with windData null', async () => {
    // prepare small stations payload
    const sampleStations = [
      { id: '001', name: 'S1', lat: 50.0, lon: 8.0, priority: 1 },
      { id: '002', name: 'S2', lat: 51.0, lon: 9.0, priority: 2 }
    ];

    // mock global.fetch to return stations.json
    // @ts-ignore
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(sampleStations) }));

    // mock fetchWindDataForStation to always return null
    const spy = vi.spyOn(measurementsService, 'fetchWindDataForStation').mockResolvedValue(null as any);

    // ensure model starts empty
    commonDataModel.setAllStations([]);
    commonDataModel.setVisibleStations([]);

    // minimal bounds object that accepts any point
    const bounds = {
      contains: (_: { lat: number; lng?: number }) => true,
      getCenter: () => ({ distanceTo: () => 0 })
    } as any;

    await updateStationsOnMapAction(bounds as any);

    expect(commonDataModel.allStations).toHaveLength(sampleStations.length);
    expect(commonDataModel.visibleStations.length).toBeGreaterThan(0);
    // each visible station should have windData null (since mock returns null)
    for (const st of commonDataModel.visibleStations) {
      expect(st.windData).toBeNull();
    }

    spy.mockRestore();
  });
});
