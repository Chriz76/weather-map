/**
 * @typedef {{ message: string }} ToastPayload
 * @typedef {{ activeOverlayUrl: string|null, isLocating: boolean, isActiveLoading: boolean, isLoadingModal: boolean, toast: string | ToastPayload | null }} UIState
 */

export class WeatherUi extends EventTarget {
    /**
     * @param {(eventName: string, detail: any) => void} [dispatchEventCallback]
     */
    constructor(dispatchEventCallback) {
        super();

        /** @type {UIState} */
        this._ui = {
            activeOverlayUrl: null,
            isLocating: false,
            isActiveLoading: false,
            isLoadingModal: false,
            toast: null
        };

        this._dispatchEventCallback = typeof dispatchEventCallback === 'function' ? dispatchEventCallback : null;
    }

    /**
     * @param {string} eventName
     * @param {any} detail
     */
    _emit(eventName, detail) {
        const event = new CustomEvent(eventName, { detail });
        super.dispatchEvent(event);
        if (this._dispatchEventCallback) {
            this._dispatchEventCallback(eventName, detail);
        }
    }

    get activeOverlayUrl() {
        return this._ui.activeOverlayUrl;
    }

    get isLocating() {
        return this._ui.isLocating;
    }

    get isActiveLoading() {
        return this._ui.isActiveLoading;
    }

    get isLoadingModal() {
        return this._ui.isLoadingModal;
    }

    get toast() {
        return this._ui.toast;
    }

    /**
     * @param {string | ToastPayload | null} payload
     */
    setToast(payload) {
        this._ui.toast = payload;
        this._emit('model:show-toast-changed', payload);
    }

    /**
     * Set loading state.
     * @param {boolean} isLoading
     * @param {boolean} [modal=false]
     */
    setIsActiveLoading(isLoading, modal = false) {
        const isLoadingBool = !!isLoading;
        const modalBool = !!modal;

        this._ui.isActiveLoading = isLoadingBool;
        this._ui.isLoadingModal = modalBool;
        this._emit('model:active-loading-changed', { isLoading: isLoadingBool, modal: modalBool });
    }

    /**
     * @param {boolean} value
     */
    setIsLocating(value) {
        this._ui.isLocating = value;
        this._emit('model:locating-changed', value);
    }

    /**
     * @param {string|null} url
     */
    setActiveOverlayUrl(url) {
        this._ui.activeOverlayUrl = url;
        this._emit('model:overlay-url-updated', url);
    }
}

export const weatherUi = new WeatherUi();
export default weatherUi;
