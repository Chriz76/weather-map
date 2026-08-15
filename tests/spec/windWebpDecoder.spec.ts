import { decodeWindArrowPointsFromImageData } from '../../src/utils/windWebpDecoder';
import { windArrowOverlayView } from '../../src/views/windArrowOverlayView';

describe('wind WebP decoder', () => {
  it('decodes a subsampled wind point and applies Mercator heading correction', () => {
    const width = 21;
    const height = 21;
    const data = new Uint8ClampedArray(width * height * 4);
    const index = 0;

    data[index] = 255;
    data[index + 1] = 128;
    data[index + 2] = 0;
    data[index + 3] = 255;

    const imageData = new ImageData(data, width, height);
    const points = decodeWindArrowPointsFromImageData(imageData, {
      bounds: [
        [37.5, -12.0],
        [55.4, 16.0]
      ]
    });

    expect(points).toHaveLength(1);
    expect(points[0].position[0]).toBeCloseTo(-12.0, 5);
    expect(points[0].position[1]).toBeCloseTo(55.4, 5);
    expect(points[0].angle).toBeGreaterThan(80);
    expect(points[0].angle).toBeLessThan(100);
  });

  it('exports the overlay view API', () => {
    expect(typeof windArrowOverlayView.init).toBe('function');
  });
});
