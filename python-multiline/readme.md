# Python Multiline Backend

`main.py` is the active FastAPI entrypoint for the Python service.

Run it with:

```bash
python -m uvicorn main:app --host 0.0.0.0 --port 8123 --reload
```

# Plot LAS files
python3 python-multiline/plot_las_graphs.py 108890_A.las 108890_B.las --output las_graphs.png --title "Sample LAS Curves"
