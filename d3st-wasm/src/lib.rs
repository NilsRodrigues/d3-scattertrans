use thiserror::Error;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
}

mod fuzzy_dbscan;

#[wasm_bindgen]
pub struct FuzzyCluster {
    inner: fuzzy_dbscan::FuzzyDBSCAN,
}

#[derive(Debug, Error)]
pub enum ClusterError {
    #[error("unexpected end of input")]
    UnexpectedEndOfInput,
}

impl FuzzyCluster {
    /// Clusters data. Uses const implementations for up to 7 dimensions.
    ///
    /// # Parameters
    /// - packed_data: Float32Array of data point values
    /// - dimensions: number of dimensions per data point
    ///
    /// # Return Value
    /// Returns packed clusters: u16 array of (point count, (index | (category << 14), soft label)+).
    fn cluster(&self, packed_data: Vec<u8>, dimensions: usize) -> Result<Vec<u8>, ClusterError> {
        macro_rules! const_dims {
            ($($dim:tt),+) => {
                match dimensions {
                    $(
                    $dim => {
                        let data = read_packed_data::<$dim>(&packed_data)?;
                        let clusters = self.inner.cluster(&data);
                        pack_clusters(&clusters)
                    }
                    )+
                    _ => {
                        let data = read_packed_data_dyn(&packed_data, dimensions)?;
                        let clusters = self.inner.cluster(&data);
                        pack_clusters(&clusters)
                    }
                }
            }
        }

        Ok(const_dims!(1, 2, 3, 4, 5, 6, 7))
    }
}

#[wasm_bindgen]
impl FuzzyCluster {
    #[wasm_bindgen(constructor)]
    pub fn new(eps_min: f64, eps_max: f64, pts_min: f64, pts_max: f64) -> Self {
        FuzzyCluster {
            inner: fuzzy_dbscan::FuzzyDBSCAN {
                eps_min,
                eps_max,
                pts_min,
                pts_max,
            },
        }
    }

    #[wasm_bindgen(js_name = "cluster")]
    pub fn cluster_js(&self, packed_data: Vec<u8>, dimensions: usize) -> Result<Vec<u8>, JsValue> {
        self.cluster(packed_data, dimensions)
            .map_err(|err| JsValue::from(format!("{}", err)))
    }
}

type PointScalar = f32;
struct DataPoint<'a, const N: usize> {
    data: &'a [PointScalar],
}

impl<'a, const N: usize> fuzzy_dbscan::MetricSpace for DataPoint<'a, N> {
    fn distance(&self, other: &Self) -> f64 {
        let mut sum = 0.;
        for i in 0..N {
            let diff = self.data[i] - other.data[i];
            sum += (diff * diff) as f64;
        }
        sum.sqrt()
    }
}

struct DataPointDyn<'a> {
    data: &'a [PointScalar],
    dimensions: usize,
}

impl<'a> fuzzy_dbscan::MetricSpace for DataPointDyn<'a> {
    fn distance(&self, other: &Self) -> f64 {
        let mut sum = 0.;
        for i in 0..self.dimensions {
            let diff = self.data[i] - other.data[i];
            sum += (diff * diff) as f64;
        }
        sum.sqrt()
    }
}

fn byte_array_as_scalar_type(arr: &[u8]) -> Result<&[PointScalar], ClusterError> {
    if arr.len() % std::mem::size_of::<PointScalar>() != 0 {
        return Err(ClusterError::UnexpectedEndOfInput);
    }
    let transmuted_len = arr.len() / std::mem::size_of::<PointScalar>();
    // SAFETY: array length has been checked above, so this transmutation should be safe
    Ok(unsafe { std::slice::from_raw_parts(arr.as_ptr() as *const PointScalar, transmuted_len) })
}

fn read_packed_data<const N: usize>(
    packed_data: &[u8],
) -> Result<Vec<DataPoint<N>>, ClusterError> {
    let packed_data = byte_array_as_scalar_type(packed_data)?;
    if packed_data.len() % N != 0 {
        return Err(ClusterError::UnexpectedEndOfInput);
    }
    let point_count = packed_data.len() / N;
    let mut points = Vec::with_capacity(point_count);
    for i in 0..point_count {
        points.push(DataPoint {
            data: &packed_data[(i * N)..((i + 1) * N)],
        });
    }
    Ok(points)
}

fn read_packed_data_dyn(
    packed_data: &[u8],
    dimensions: usize,
) -> Result<Vec<DataPointDyn>, ClusterError> {
    let packed_data = byte_array_as_scalar_type(packed_data)?;
    if packed_data.len() % dimensions != 0 {
        return Err(ClusterError::UnexpectedEndOfInput);
    }
    let point_count = packed_data.len() / dimensions;
    let mut points = Vec::with_capacity(point_count);
    for i in 0..point_count {
        points.push(DataPointDyn {
            data: &packed_data[(i * dimensions)..((i + 1) * dimensions)],
            dimensions,
        });
    }
    Ok(points)
}

fn pack_clusters(clusters: &[fuzzy_dbscan::Cluster]) -> Vec<u8> {
    let mut out: Vec<u16> = Vec::with_capacity(clusters.iter().map(|c| c.len() * 2 + 1).sum());
    for cluster in clusters {
        out.push(cluster.len() as u16);
        for assignment in cluster {
            let category_index = match assignment.category {
                fuzzy_dbscan::Category::Core => 0,
                fuzzy_dbscan::Category::Border => 1,
                fuzzy_dbscan::Category::Noise => 2,
            };
            out.push(assignment.index as u16 | (category_index << 14));
            out.push((assignment.label * 65535.) as u16);
        }
    }

    // Vec::into_raw_parts is unstable, so we'll just do this
    let (ptr, len, cap) = (out.as_ptr(), out.len(), out.capacity());
    std::mem::forget(out);

    // SAFETY: u16 is double the size of u8, so this should be fine
    unsafe { Vec::from_raw_parts(ptr as *mut u8, len * 2, cap * 2) }
}
