import { EventEmitter } from 'events';
import { DataPoint, Dimension } from '../data';
import { ScatterView } from '../view';
import { ScatterplotMatrix } from './matrix';
import { parse as parseCsv, stringify as stringifyCsv } from 'csv/sync';

/**
 * Prompts the user to specify data dimensions.
 */
function runDimensionsModal(data: DataPoint[], dimensions: Set<string>, nanDimensions: Set<string>): Promise<Dimension[]> {
    return new Promise((resolve, reject) => {
        const modalContainer = document.createElement('div');
        Object.assign(modalContainer.style, {
            position: 'fixed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            inset: '0',
            background: 'rgba(0, 0, 0, 0.1)',
            opacity: '0',
            transition: 'opacity 0.3s',
            zIndex: '1000'
        });
        document.body.appendChild(modalContainer);

        const modal = document.createElement('div');
        Object.assign(modal.style, {
            position: 'relative',
            background: 'white',
            color: 'black',
            border: '1px solid rgba(0, 0, 0, 0.1)',
            borderRadius: '8px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
            font: '13px sans-serif',
            overflow: 'auto',
            maxHeight: '95vh'
        });
        modalContainer.className = 'd3st-data-import-modal-container';
        modalContainer.appendChild(modal);

        {
            const title = document.createElement('h2');
            title.style.marginTop = '0';
            title.style.marginBottom = '8px';
            title.style.padding = '8px 16px 0 16px';
            title.textContent = 'Import Data';
            modal.appendChild(title);
            const subtitle = document.createElement('h4');
            subtitle.style.marginTop = '0';
            subtitle.style.padding = '0 16px';
            subtitle.textContent = 'Specify how to import each data dimension.';
            subtitle.style.fontWeight = 'inherit';
            modal.appendChild(subtitle);
        }

        const dimSettings: {
            name: string,
            method: HTMLSelectElement,
            domainLo?: HTMLInputElement,
            domainHi?: HTMLInputElement,
            logChkbox?: HTMLInputElement
        }[] = [];
        {
            const dimContainer = document.createElement('ul');
            Object.assign(dimContainer.style, {
                padding: '0',
                margin: '0',
                listStyle: 'none'
            });
            modal.appendChild(dimContainer);

            for (const dimName of dimensions) {
                const isNan = nanDimensions.has(dimName);

                const li = document.createElement('li');
                Object.assign(li.style, {
                    padding: '4px 16px',
                    borderBottom: '1px solid rgba(0, 0, 0, 0.1)'
                });
                dimContainer.appendChild(li);

                const details = document.createElement('div');
                Object.assign(details.style, {
                    marginBottom: '4px'
                });
                li.appendChild(details);
                const name = document.createElement('div');
                name.style.fontWeight = '600';
                details.appendChild(name);
                name.textContent = dimName;

                if (isNan) {
                    const isNanText = document.createElement('div');
                    isNanText.style.fontSize = 'smaller';
                    isNanText.style.marginTop = '2px';
                    details.appendChild(isNanText);
                    isNanText.textContent = '(not a number)';
                }

                const controls = document.createElement('div');
                li.appendChild(controls);

                const method = document.createElement('select');
                controls.appendChild(method);
                {
                    const ignore = document.createElement('option');
                    ignore.value = 'ignore';
                    ignore.textContent = 'Ignore';
                    method.appendChild(ignore);
                }

                let domainLo: HTMLInputElement | undefined;
                let domainHi: HTMLInputElement | undefined;
                let logChkbox: HTMLInputElement | undefined;

                if (!isNan) {
                    const read = document.createElement('option');
                    read.value = 'read';
                    read.textContent = 'Read';
                    read.selected = true;
                    method.appendChild(read);

                    const domain = document.createElement('div');
                    controls.appendChild(domain);
                    const label = document.createElement('span');
                    label.textContent = 'Domain: ';
                    domain.appendChild(label);
                    domainLo = document.createElement('input');
                    domain.appendChild(domainLo);
                    domainLo.type = 'number';
                    domainHi = document.createElement('input');
                    domain.appendChild(domainHi);
                    domainHi.type = 'number';
                    const inputStyle = {
                        width: '7em'
                    };
                    Object.assign(domainLo.style, inputStyle);
                    Object.assign(domainHi.style, inputStyle);

                    const defaultDomain = Dimension.fromData(dimName, data, 0.0).domain;
                    domainLo.value = defaultDomain[0].toString();
                    domainHi.value = defaultDomain[1].toString();

                    method.addEventListener('change', () => {
                        domain.style.display = method.value === 'read' ? '' : 'none';
                    });

                    const log = document.createElement('div');
                    logChkbox = document.createElement('input');
                    const logLabel = document.createElement('label');
                    logLabel.textContent = 'Log';
                    logChkbox.type = 'checkbox';
                    logLabel.htmlFor = logChkbox.id = Math.random().toString();
                    log.appendChild(logChkbox);
                    log.appendChild(document.createTextNode(' '));
                    log.appendChild(logLabel);
                    controls.appendChild(log);
                }

                dimSettings.push({
                    name: dimName,
                    method,
                    domainLo,
                    domainHi,
                    logChkbox,
                });
            }
        }

        const close = () => {
            modalContainer.style.opacity = '0';
            modalContainer.style.pointerEvents = 'none';
            modalContainer.addEventListener('transitionend', () => {
                modalContainer.parentNode?.removeChild(modalContainer);
            });
        };
        const confirm = () => {
            close();

            const dimensions = [];
            for (const dim of dimSettings) {
                if (dim.method.value === 'read') {
                    const domainLo = +dim.domainLo!.value;
                    const domainHi = +dim.domainHi!.value;
                    const log = dim.logChkbox!.checked;

                    const mapping = log ? Dimension.Log : Dimension.Linear;

                    dimensions.push(new Dimension(dim.name, [domainLo, domainHi], mapping));
                }
            }

            resolve(dimensions);
        };

        {
            const buttons = document.createElement('div');
            buttons.style.padding = '8px 16px';
            buttons.style.textAlign = 'right';

            const cancelButton = document.createElement('button');
            cancelButton.textContent = 'Cancel';
            buttons.appendChild(cancelButton);

            const confirmButton = document.createElement('button');
            confirmButton.textContent = 'Import';
            buttons.appendChild(confirmButton);

            cancelButton.addEventListener('click', () => {
                close();
                reject();
            });
            confirmButton.addEventListener('click', confirm);

            modal.appendChild(buttons);
        }

        requestAnimationFrame(() => {
            modalContainer.style.opacity = '1';
        });
    });
}

export class FileIo extends EventEmitter {
    private _node: HTMLDivElement;
    private _matrix?: ScatterplotMatrix;

    constructor() {
        super();
        this._node = document.createElement('div');

        const importButton = document.createElement('button');
        importButton.textContent = 'Import Data';
        this._node.appendChild(importButton);

        const loadPathButton = document.createElement('button');
        loadPathButton.textContent = 'Load Path';
        this._node.appendChild(loadPathButton);

        const storePathButton = document.createElement('button');
        storePathButton.textContent = 'Store Path';
        this._node.appendChild(storePathButton);

        const setUpImportButton = (button: HTMLButtonElement, onFile: (f: File) => void) => {
            button.addEventListener('dragover', event => {
                event.preventDefault();
                button.style.outline = '1px solid #00f';
            });
            button.addEventListener('dragleave', event => {
                button.style.outline = '';
            });
            button.addEventListener('drop', event => {
                button.style.outline = '';
                event.preventDefault();
                const file = event.dataTransfer?.files[0];
                if (!file) {
                    alert('Not a file');
                    return;
                }
                onFile(file);
            });
            button.addEventListener('click', () => {
                const filePicker = document.createElement('input');
                filePicker.type = 'file';
                filePicker.accept = 'text/csv';
                filePicker.addEventListener('change', () => {
                    const file = filePicker.files && filePicker.files[0]
                    if (!file) return;
                    onFile(file);
                });
                filePicker.click();
            });
        };

        setUpImportButton(importButton, file => this.loadData(file));
        setUpImportButton(loadPathButton, file => this.loadPath(file));

        storePathButton.addEventListener('click', () => this.storePath());
    }

    node(): HTMLDivElement {
        return this._node;
    }

    connect(target: ScatterplotMatrix) {
        this._matrix = target;
        return this;
    }

    disconnect() {
        this._matrix = undefined;
        return this;
    }

    loadData(file: File) {
        const fileReader = new FileReader();
        fileReader.onload = () => {
            const input = parseCsv(fileReader.result as string, { columns: true, skip_empty_lines: true });

            const dimensions: Set<string> = new Set(input.flatMap((entry: object) => Object.keys(entry)));
            const nanDimensions: Set<string> = new Set();

            const data: DataPoint[] = [];
            for (const entry of input) {
                const item: DataPoint = {};
                for (const dimension of dimensions) {
                    const num = +(entry[dimension].trim());
                    if (Number.isFinite(num)) {
                        item[dimension] = num;
                    } else {
                        item[dimension] = entry[dimension];
                        if (entry[dimension].trim()) nanDimensions.add(dimension);
                    }
                }
                data.push(item);
            }

            runDimensionsModal(data, dimensions, nanDimensions).then(dimensions => {
                this.emit('loadData', data, dimensions);
                if (this._matrix) {
                    this._matrix.dimensions(dimensions).data(data);
                }
            }).catch(() => {});
        };
        fileReader.readAsText(file);
    }

    loadPath(file: File) {
        const matrix = this._matrix;
        if (!matrix) {
            alert('File IO is not connected to anything');
            return;
        }

        const fileReader = new FileReader();
        fileReader.onload = () => {
            const input = parseCsv(fileReader.result as string, { skip_empty_lines: true });

            const dims = matrix.dimensions();
            const dimNames = dims.map(dim => dim.name);
            const path = [];
            for (const pair of input) {
                const x = dimNames.indexOf(pair[0]);
                const y = dimNames.indexOf(pair[1]);
                if (x === -1 || y === -1) {
                    alert('Unknown dimensions in pair: ' + pair[0] + ', ' + pair[1] + '.\nTry loading the data first.');
                    return;
                }
                path.push(new ScatterView(dims[x], dims[y]));
            }

            matrix.transBuilder().begin();
            matrix.transBuilder().path.views!.push(...path);
            matrix.transBuilder().path.renderPaths();
        };
        fileReader.readAsText(file);
    }

    storePath() {
        const matrix = this._matrix;
        if (!matrix) {
            alert('File IO is not connected to anything');
            return;
        }
        const plot = matrix.plot();

        let views: ScatterView[] | null = null;
        if (matrix.transBuilder().buildingTransition) {
            views = matrix.transBuilder().path.views!;
        } else if (plot) {
            const transition = plot.transition();
            if (transition) {
                views = transition.views;
            }
        }

        if (views) {
            const path = [];
            for (const view of views) {
                path.push([view.x.name, view.y.name]);
            }
            const blob = new Blob([stringifyCsv(path)]);
            const blobUrl = URL.createObjectURL(blob);
            const downloadLink = document.createElement('a');
            downloadLink.href = blobUrl;
            downloadLink.download = 'path.csv';
            downloadLink.click();
            URL.revokeObjectURL(blobUrl);
        } else {
            alert('No path loaded');
        }
    }
}

export function fileio() {
    return new FileIo();
}
