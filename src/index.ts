import * as sTransitions from './transitions';
import * as sData from './data';
import * as sView from './view';
import * as sControls from './controls';

export const scatterTrans = {
    ...sTransitions,
    ...sData,
    ...sView,
    ...sControls
};
