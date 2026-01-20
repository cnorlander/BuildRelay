FROM python:3.13-slim
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Install steamcmd dependencies
RUN dpkg --add-architecture i386 && \
    apt-get update && apt-get install -y \
    lib32gcc-s1 \
    lib32stdc++6 \
    libc6:i386 \
    libstdc++6:i386 \
    wget \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install SteamCMD
RUN mkdir -p /steamcmd && cd /steamcmd && \
    wget -qO- 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz' | tar zxvf - && \
    mkdir -p /steamcmd/config && \
    chmod +x /steamcmd/steamcmd.sh

# Add steamcmd to PATH and create wrapper script
ENV PATH="/steamcmd:${PATH}"
RUN echo '#!/bin/bash\ncd /steamcmd && ./steamcmd.sh "$@"' > /usr/local/bin/steamcmd && \
    chmod +x /usr/local/bin/steamcmd

# Create volume mount point for Steam config (preserves login tokens and credentials)
VOLUME /root/Steam

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY worker.py .
COPY lib/ ./lib/
COPY entrypoint.sh .

RUN chmod +x entrypoint.sh

ENV NUM_WORKERS=1

CMD ["./entrypoint.sh"]
