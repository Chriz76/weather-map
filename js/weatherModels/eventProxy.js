// Central event proxy used by WeatherModel and views/controllers
const _target = new EventTarget();

const eventProxy = {
    addEventListener: _target.addEventListener.bind(_target),
    removeEventListener: _target.removeEventListener.bind(_target),
    dispatchEvent: _target.dispatchEvent.bind(_target)
};

export default eventProxy;
