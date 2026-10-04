/** UI state model */
export type ToastPayload = { message: string };

export class UiStateModel extends EventTarget {
    private _ui: {
        activeOverlayUrl: string | null;
        isLocating: boolean;
        isActiveLoading: boolean;
        isLoadingModal: boolean;
        toast: string | ToastPayload | null;
        showWindMeasurements: boolean;
    };
    constructor() {
        super();
        this._ui = {
            activeOverlayUrl: null,
            isLocating: false,
            isActiveLoading: false,
            isLoadingModal: false,
            toast: null,
            showWindMeasurements: true
        };
    }

    private _emit(eventName: string): void {
        const event = new CustomEvent(eventName);
        super.dispatchEvent(event);
    }

    get activeOverlayUrl(): string | null { return this._ui.activeOverlayUrl; }
    get isLocating(): boolean { return this._ui.isLocating; }
    get isActiveLoading(): boolean { return this._ui.isActiveLoading; }
    get showWindMeasurements(): boolean { return this._ui.showWindMeasurements; }
    get isLoadingModal(): boolean { return this._ui.isLoadingModal; }
    get toast(): string | ToastPayload | null { return this._ui.toast; }

    setToast(payload: string | ToastPayload | null): void {
        this._ui.toast = payload;
        this._emit('ui:toast-changed');
    }

    setIsActiveLoading(isLoading: boolean, modal = false): void {
        const isLoadingBool = !!isLoading;
        const modalBool = !!modal;
        this._ui.isActiveLoading = isLoadingBool;
        this._ui.isLoadingModal = modalBool;
        this._emit('ui:loading-changed');
    }

    setIsLocating(value: boolean): void {
        this._ui.isLocating = value;
        this._emit('ui:locating-changed');
    }

    setActiveOverlayUrl(url: string | null): void {
        this._ui.activeOverlayUrl = url;
        this._emit('ui:overlay-url-updated');
    }

    setShowWindMeasurements(value: boolean): void {
        this._ui.showWindMeasurements = !!value;
        this._emit('ui:wind-measurements-visibility-changed');
    }
}

export const uiStateModel = new UiStateModel();
export default uiStateModel;
