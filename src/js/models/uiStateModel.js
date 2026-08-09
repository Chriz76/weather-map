/**
 * @typedef {{ message: string }} ToastPayload
 * @typedef {{ activeOverlayUrl: string|null, isLocating: boolean, isActiveLoading: boolean, isLoadingModal: boolean, toast: string | ToastPayload | null, showWindMeasurements: boolean }} UIState
 */

export class UiStateModel extends EventTarget {
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
            toast: null,
            showWindMeasurements: true
        };

        this._dispatchEventCallback = typeof dispatchEventCallback === 'function' ? dispatchEventCallback : null;
    }

    /**
     * @param {string} eventName
     * @param {any} detail
     */
    _emit(eventName, detail) {
        const event = new CustomEvent(eventName);
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

    get showWindMeasurements() {
        return this._ui.showWindMeasurements;
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
        this._emit('ui:toast-changed', payload);
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
        this._emit('ui:loading-changed', { isLoading: isLoadingBool, modal: modalBool });
    }

    /**
     * @param {boolean} value
     */
    setIsLocating(value) {
        this._ui.isLocating = value;
        this._emit('ui:locating-changed', value);
    }

    /**
     * @param {string|null} url
     */
    setActiveOverlayUrl(url) {
        this._ui.activeOverlayUrl = url;
        this._emit('ui:overlay-url-updated', url);
    }

    /**
     * @param {boolean} value
     */
    setShowWindMeasurements(value) {
        this._ui.showWindMeasurements = !!value;
        this._emit('ui:wind-measurements-visibility-changed', this._ui.showWindMeasurements);
    }
}

export const uiStateModel = new UiStateModel();
export default uiStateModel;
