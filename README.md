# [D3](https://d3js.org/) plug-in for animated scatter plot transitions

---

This is part of the [supplemental material](https://doi.org/10.18419/darus-3451)[^1] accompanying the paper **"Comparative Evaluation of Animated Scatter Plot Transitions"**.
If you use any of this supplemental material for publications, please reference the main paper[^2].

---

## Authors
* Animation source code by Vincent Brandt.
* Small adaptations to animation library (noise cluster handling & convenience methods for domain scaling) by [Nils Rodrigues](https://github.com/NilsRodrigues).
* Test application with scatter plot matrix by Vincent Brandt.
* Uses a modified version of an [implementation of FuzzyDBSCAN](https://github.com/schulzch/fuzzy_dbscan). Modifications by Vincent Brandt.

## Testing / Demo

1. Open [./test/test.html](./test/test.html) in your preferred web browser.
1. Click on `Import Data` and load your CSV data file.<br>
   We included a sample data set: [`./test/autoMPG.csv`](./test/autoMPG.csv) ([file information](./test/autoMPG-info.txt), [file source](https://archive.ics.uci.edu/ml/datasets/Auto%2BMPG)).
1. Explore the data and build transitions. Use the player controls to pause or step through the animations.

## Usage

To use the plug-in in your own code:

1. Add a reference to [D3](https://d3js.org/)[^3] in your HTML file.
1. Add a reference to our plug-in [`./dist/index.js`](./dist/index.js), after the reference to D3.
1. For examples of how to use the plug-in library:<br>
   * See the test page above.
   * See our interactive demonstration in the [supplemental material](https://doi.org/10.18419/darus-3451).

## Building the project

```sh
cd d3-scattertrans
npm install
npm run build
```


[^1]: N\. Rodrigues, F. L. Dennig, V. Brandt, D. A. Keim, and D. Weiskopf, "Comparative Evaluation of Animated Scatter Plot Transitions," DaRUS, 2023. [https://doi.org/10.18419/darus-3451](https://doi.org/10.18419/darus-3451)
[^2]: N\. Rodrigues, F. L. Dennig, V. Brandt, D. A. Keim, and D. Weiskopf, "Comparative Evaluation of Animated Scatter Plot Transitions," in IEEE Transactions on Visualization and Computer Graphics, 2024.
[^3]: M\. Bostock, V. Ogievetsky, and J. Heer, "D³: Data-driven documents," in IEEE Transactions on Visualization and Computer Graphics, 17(12), pp. 2301-2309, 2011. [https://doi.org/10.1109/TVCG.2011.185](https://doi.org/10.1109/TVCG.2011.185)
