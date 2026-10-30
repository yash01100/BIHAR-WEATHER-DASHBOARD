from pathlib import Path
import json
import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    mean_absolute_error,
    mean_squared_error,
    precision_score,
    recall_score,
    f1_score,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder
BASE_DIR = Path(__file__).resolve().parent
DATA_FILE = BASE_DIR / "data" / "bihar_weather_history.csv"
MODEL_DIR = BASE_DIR / "models"
MODEL_DIR.mkdir(exist_ok=True)
df = pd.read_csv(DATA_FILE)
df["date"] = pd.to_datetime(df["date"])
df = df.sort_values(["district", "date"]).reset_index(drop=True)
# Target: next day's rainfall for the same district
df["target_rainfall"] = df.groupby("district")["rainfall"].shift(-1)
# Use only information available on the prediction day
df["target_rain"] = (df["target_rainfall"] > 0).astype(int)
feature_columns = [
    "district",
    "temperature_max",
    "temperature_min",
    "humidity",
    "rainfall",
]
df = df.dropna(subset=feature_columns + ["target_rainfall"]).copy()
train = df[df["date"] < "2025-01-01"].copy()
test = df[df["date"] >= "2025-01-01"].copy()
X_train = train[feature_columns]
X_test = test[feature_columns]
y_train_class = train["target_rain"]
y_test_class = test["target_rain"]
# Separate amount model: train only on days when next-day rain occurs
rain_train = train[train["target_rainfall"] > 0]
rain_test = test[test["target_rainfall"] > 0]
categorical_features = ["district"]
numeric_features = [
    "temperature_max",
    "temperature_min",
    "humidity",
    "rainfall",
]
preprocessor = ColumnTransformer(
    transformers=[
        ("district", OneHotEncoder(handle_unknown="ignore"), categorical_features),
        ("numeric", "passthrough", numeric_features),
    ]
)
classifier = Pipeline([
    ("preprocessor", preprocessor),
    ("model", RandomForestClassifier(
        n_estimators=200,
        min_samples_leaf=3,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1,
    )),
])
print("Training rain/no-rain classifier...")
classifier.fit(X_train, y_train_class)
class_predictions = classifier.predict(X_test)
class_probabilities = classifier.predict_proba(X_test)[:, 1]
print("\nRAIN CLASSIFICATION RESULTS")
print("Accuracy:", round(accuracy_score(y_test_class, class_predictions), 4))
print("Precision:", round(precision_score(y_test_class, class_predictions, zero_division=0), 4))
print("Recall:", round(recall_score(y_test_class, class_predictions, zero_division=0), 4))
print("F1 score:", round(f1_score(y_test_class, class_predictions, zero_division=0), 4))
print("Confusion matrix:")
print(confusion_matrix(y_test_class, class_predictions))
print(classification_report(y_test_class, class_predictions, zero_division=0))
amount_preprocessor = ColumnTransformer(
    transformers=[
        ("district", OneHotEncoder(handle_unknown="ignore"), categorical_features),
        ("numeric", "passthrough", numeric_features),
    ]
)
regressor = Pipeline([
    ("preprocessor", amount_preprocessor),
    ("model", RandomForestRegressor(
        n_estimators=200,
        min_samples_leaf=3,
        random_state=42,
        n_jobs=-1,
    )),
])
print("\nTraining rainfall amount regressor...")
regressor.fit(
    rain_train[feature_columns],
    rain_train["target_rainfall"],
)
amount_predictions = regressor.predict(rain_test[feature_columns])
amount_predictions = np.maximum(amount_predictions, 0)
print("\nRAIN AMOUNT RESULTS (RAINY TEST DAYS)")
print("Test rainy days:", len(rain_test))
print("MAE:", round(mean_absolute_error(rain_test["target_rainfall"], amount_predictions), 3))
print("RMSE:", round(np.sqrt(mean_squared_error(rain_test["target_rainfall"], amount_predictions)), 3))
joblib.dump(classifier, MODEL_DIR / "rain_classifier.joblib")
joblib.dump(regressor, MODEL_DIR / "rainfall_regressor.joblib")
metadata = {
    "training_period": "2021-01-01 to 2024-12-31",
    "testing_period": "2025-01-01 to 2025-12-31",
    "target": "next_day_rainfall",
    "features": feature_columns,
    "districts": int(df["district"].nunique()),
    "training_rows": int(len(train)),
    "testing_rows": int(len(test)),
    "classifier_accuracy": float(accuracy_score(y_test_class, class_predictions)),
    "classifier_precision": float(precision_score(y_test_class, class_predictions, zero_division=0)),
    "classifier_recall": float(recall_score(y_test_class, class_predictions, zero_division=0)),
    "classifier_f1": float(f1_score(y_test_class, class_predictions, zero_division=0)),
    "rainy_test_days": int(len(rain_test)),
    "regressor_mae": float(mean_absolute_error(rain_test["target_rainfall"], amount_predictions)),
    "regressor_rmse": float(np.sqrt(mean_squared_error(rain_test["target_rainfall"], amount_predictions))),
    "data_source": "Open-Meteo Historical Archive",
    "model_note": "Experimental ML estimate; not an official IMD forecast.",
}
with open(MODEL_DIR / "model_metrics.json", "w", encoding="utf-8") as file:
    json.dump(metadata, file, indent=4)
print("\nModels saved in:", MODEL_DIR)
print("Training and evaluation completed.")
