FROM opencfd/openfoam-default:2312
USER root
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip && rm -r /var/lib/apt/lists/*
RUN python3 -m pip install --no-cache-dir 'pydantic>=2.9,<3'
ENV AIDC_OPENFOAM_BASHRC=/usr/lib/openfoam/openfoam2312/etc/bashrc
ENV PYTHONUTF8=1 OMP_NUM_THREADS=2
WORKDIR /app
ENTRYPOINT []
