FROM ghcr.io/fenics/dolfinx/dolfinx:v0.9.0
USER root
ENV PIP_BREAK_SYSTEM_PACKAGES=1
RUN python3 -m pip install --no-cache-dir 'pydantic>=2.9,<3'
ENV PYTHONUTF8=1 OMP_NUM_THREADS=2
WORKDIR /app
ENTRYPOINT []
