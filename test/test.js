function init() {
    const fileio = d3.scatterTrans.fileio();
    document.body.appendChild(fileio.node());

    const debugContainer = document.createElement('div');
    const debugCheckbox = document.createElement('input');
    debugCheckbox.id = 'debug-checkbox';
    debugCheckbox.type = 'checkbox';
    const debugLabel = document.createElement('label');
    debugLabel.textContent = 'Debug Spline Paths';
    debugLabel.style.font = '10px sans-serif';
    debugLabel.setAttribute('for', 'debug-checkbox');
    debugContainer.appendChild(debugCheckbox);
    debugContainer.appendChild(debugLabel);
    document.body.appendChild(debugContainer);

    const size = 400;
    const svg = d3.create('svg')
        .attr('width', size + 60)
        .attr('height', size + 60)
        .style('overflow', 'visible');
    document.body.appendChild(svg.node());

    const chart = svg.append('g').attr('transform', 'translate(50, 10)');

    let currentView = 0;

    const x = d3.scaleLinear().domain([0, 1]).range([0, size]);
    const y = d3.scaleLinear().domain([0, 1]).range([size, 0]);

    chart.append('g').call(d3.axisLeft(y)).attr('class', 'axis axis-left');
    chart.append('g').attr('transform', `translate(0, ${size})`).call(d3.axisBottom(x)).attr('class', 'axis axis-bottom');

    const debugRender = chart.append('g');

    const scatterplot = d3.scatterTrans.scatterplot().size(size, size);

    const updateDebugRender = () => {
        const debug = debugRender.node();
        debug.innerHTML = '';
        if (debugCheckbox.checked) {
            if (scatterplot.transition()?.drawDebug) {
                scatterplot.transition().drawDebug(debug, ([x, y]) => {
                    return [scatterplot.normalizedXToScreen(x), scatterplot.normalizedYToScreen(y)];
                });
            }
        }
    };

    debugCheckbox.addEventListener('change', updateDebugRender);

    const chartData = chart.append('g');
    fileio.on('loadData', (data, dimensions) => {
        scatterplot
            .data(data)
            .view(dimensions[0], dimensions[0])
            .createCircles(chartData)
            .attr('r', 2)
            .style('fill', 'currentColor');
        updateDebugRender();
    });

    scatterplot.on('transitionChange', updateDebugRender);

    const makeLog = (dim, domain = [0, 1], range = [0, 1]) => {
        const log = (value) => {
            return dim.normalize(value);
        };
        log.domain = (d) => {
            if (d) {
                domain = d;
                return log;
            }
            return domain;
        };
        log.range = (r) => {
            if (r) {
                range = r;
                return log;
            }
            return range;
        };
        log.ticks = () => {
            return [];
        };
        log.copy = () => makeLog(dim, domain, range);
        return log;
    };

    scatterplot.on('effectiveViewChange', view => {
        if (view) {
            let x, y;
            if (view.x.mapping === d3.scatterTrans.Dimension.Log) x = makeLog(view.x);
            else x = d3.scaleLinear();
            if (view.y.mapping === d3.scatterTrans.Dimension.Log) y = makeLog(view.y);
            else y = d3.scaleLinear();
            x.domain(view.x.domain).range([0, size]);
            y.domain(view.y.domain).range([size, 0]);

            chart.select('.axis-left').call(d3.axisLeft(y));
            chart.select('.axis-bottom').call(d3.axisBottom(x));
            chart.selectAll('.axis')
                .transition()
                .duration(200)
                .style('opacity', 1);
        } else {
            chart.selectAll('.axis')
                .transition()
                .duration(200)
                .style('opacity', 0);
        }
    });

    const matrix = d3.scatterTrans.scatterplotMatrix()
        .size(400)
        .connect(scatterplot)
        .rotateLabels(false);
    document.body.appendChild(matrix.node());
    matrix.node().style.marginLeft = '20px';

    fileio.connect(matrix);

    const timelineSlider = d3.scatterTrans.timelineSlider().connect(scatterplot);
    document.body.appendChild(timelineSlider.node());
}

init();
